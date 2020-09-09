import HttpStatus from 'http-status-codes'
import { get, set, isEmpty } from 'lodash'
import uuid from 'node-uuid'
import superagent from 'superagent'
import fs from 'fs'
import Redis from 'ioredis'

import DynamoDB from './service/trace-store/dynamo'
import PriceList from './service/cost-control/price-list'
import Tracer from './service/tracer'
import PriceCalculator from './service/cost-control/price-calculator'
import FlagPoleService from './service/cost-control/flag-pole'

const { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } = process.env

// Key format: tracer_{jobId}#{serviceType}#{serviceMethod}
const CACHE_KEY_PREFIX = 'tracer_'

const appRegisterStore = new DynamoDB('app-register-store')
const tracer = new Tracer()
const redisTracerCache = new Redis({
  port: REDIS_PORT,
  host: REDIS_HOST,
  family: 4,
  password: REDIS_PASSWORD,
  db: 0,
})

const registerApp = async (req, res) => {
  console.log('+++data', req.body)
  const jsonString = fs.readFileSync(req.file.path, 'utf-8')

  const cloudFormationTemplate = JSON.parse(jsonString)
  const resourceNames = Object.keys(cloudFormationTemplate.Resources)

  const sqsResourceNames = resourceNames.filter(
    (rName) => cloudFormationTemplate.Resources[rName].Type === 'AWS::SQS::Queue'
  )

  const cloudFormationData = sqsResourceNames.reduce((acc, sqsRN) => {
    const sqsResource = cloudFormationTemplate.Resources[sqsRN]
    const queueType = sqsResource.Properties.FifoQueue ? 'fifo' : 'standard'

    set(acc, `sqs.${sqsRN}.queueType`, queueType)

    return acc
  }, {
    sqs: {},
  })

  console.log('+++cloudFormationData', cloudFormationData)

  const appId = `app-${uuid.v4()}`
  const storeItem = {
    appId,
    ...cloudFormationData,
  }
  const createdItem = await appRegisterStore.put(storeItem)
  console.log('+++createdItem', createdItem)

  res.status(HttpStatus.CREATED).json(storeItem)
}

const calculateJobCosts = async ({
  jobStartTime,
  jobId,
  priceCalculator,
  flagPole,
  iterationNumber,
}) => {
  const startTime = parseInt(jobStartTime, 10) / 1000
  const allTraceSegments = await tracer.getFullTrace(jobId, startTime)

  // lambda
  const lambdaPrices = priceCalculator.calculateLambdaPrice(allTraceSegments)

  // sqs
  const sqsPrices = priceCalculator.calculateSqsPrice(allTraceSegments)

  // s3
  const s3Prices = priceCalculator.calculateS3Price(allTraceSegments)

  const totalJobPrice = lambdaPrices + sqsPrices + s3Prices
  const totalJobPriceInUSD = Number(`${totalJobPrice}e-9`)

  const isInBudgetLimit = await flagPole.isInBudgetLimit(totalJobPriceInUSD)

  console.log('+++totalJobPrice in Nano USD', {
    iteration: iterationNumber,
    isInBudgetLimit,
    'Budget limit': flagPole.getBudgetLimit(),
    'Time passed since job start': (Date.now() / 1000) - startTime,
    'Lambda total price': lambdaPrices,
    'SQS total price': sqsPrices,
    'S3 total price': s3Prices,
    'Job price in Nano USD': totalJobPrice,
    'Job price in USD': totalJobPriceInUSD,
  })
}

const calculateJobCostsFromRedis = async ({
  jobId,
  priceCalculator,
  flagPole,
  iterationNumber = 0,
  queueName = 'PreprocessedDataQueue'
}) => {
  const tracedSqsChunks = Number(await redisTracerCache.get(`${CACHE_KEY_PREFIX}${jobId}#sqs#${queueName}`)) || 0

  const tracedLambdaCacheKey = `${CACHE_KEY_PREFIX}${jobId}#lambda`
  const tracedLambdaCacheEntry = (await redisTracerCache.lrange(tracedLambdaCacheKey, 0, -1) || [])

  console.log('+++tracedLambdaCacheEntry', tracedLambdaCacheEntry)

  const tracedLambdaSegments = tracedLambdaCacheEntry.map((delimitedString) => {
    const [memoryAllocationInMB, processingTimeString] = delimitedString.split('::')
    return {
      memoryAllocationInMB: Number(memoryAllocationInMB),
      processingTime: Number(processingTimeString),
    }
  })

  // returns amount of method calls
  const tracedS3GetObjectCallsCacheKey = `${CACHE_KEY_PREFIX}${jobId}#s3#getObject`
  const tracedS3GetObjectCalls = Number(await redisTracerCache.get(tracedS3GetObjectCallsCacheKey)) || 0

  // returns array of file sizes
  const tracedS3PutObjectCallsCacheKey = `${CACHE_KEY_PREFIX}${jobId}#s3#putObject`
  const tracedS3PutObjectCalls = await redisTracerCache.lrange(tracedS3PutObjectCallsCacheKey, 0, -1) || []
  const tracedS3PutObjectFileSizeArray = tracedS3PutObjectCalls.map((str) => Number(str))

  console.log('+++calculateJobCostsFromRedis', {
    tracedSqsChunks,
    tracedLambdaSegments,
    tracedS3GetObjectCalls,
    tracedS3PutObjectFileSizeArray,
  })

  const lambdaPrices = priceCalculator.calculateLambdaPrice(tracedLambdaSegments, true)
  const sqsPrices = priceCalculator.calculateSqsPrice(tracedSqsChunks, true)
  const s3Prices = priceCalculator.calculateS3Price({
    fileSizesInKB: tracedS3PutObjectFileSizeArray,
    s3RequestsMap: {
      GetObject: tracedS3GetObjectCalls,
      PutObject: tracedS3PutObjectFileSizeArray.length,
    }
  }, true)

  console.log('+++pricingFromRedis', {
    sqsPrices,
    lambdaPrices,
    s3Prices,
  })

  const totalJobPrice = lambdaPrices + sqsPrices + s3Prices
  const totalJobPriceInUSD = Number(`${totalJobPrice}e-9`)

  const result = {
    iterationNumber,
    lambdaPrices,
    sqsPrices,
    s3Prices,
    totalJobPrice,
    totalJobPriceInUSD,
  }

  console.log('+++totalJobPriceFromRedis in Nano USD', {
    iteration: iterationNumber,
    'Lambda total price': lambdaPrices,
    'SQS total price': sqsPrices,
    'S3 total price': s3Prices,
    'Job price in Nano USD': totalJobPrice,
    'Job price in USD': totalJobPriceInUSD,
  })

  return result
}

async function calculateJobCostsPeriodically(passedArgs) {
  const pollPeriodinMs = 500
  const counter = {
    value: 0,
  }

  // delay it for 1 sec
  // await new Promise((resolve) => setTimeout(() => {
  //   console.log('#### wait for 1 sec')
  //   resolve()
  // }, 1000))

  while (counter.value < 30) {
    // console.log('++++++++++++++++++++++++++++++++++++')
    // console.log('+++counter.value', counter.value)
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, pollPeriodinMs))

    const args = {
      ...passedArgs,
      iterationNumber: counter.value,
    }

    // eslint-disable-next-line no-await-in-loop
    calculateJobCosts(args)
    calculateJobCostsFromRedis(args)
    counter.value++
  }
}

const startTracing = async (req, res) => {
  console.log('+++req.body', req.body)
  let jobUrl = 'https://17d8y590d2.execute-api.eu-central-1.amazonaws.com/dev/start-job'
  let budgetLimit = 0.025

  if (!isEmpty(req.body)) {
    const requestBody = JSON.parse(req.body)
    jobUrl = get(requestBody, 'jobUrl', jobUrl)
    budgetLimit = Number(get(requestBody, 'budgetLimit', budgetLimit))
  }

  const dateNow = Date.now()
  const jobId = uuid.v4()
  const response = await superagent
    .post(jobUrl)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .send({
      jobId
    })

  console.log('+++data', req.body)
  console.log('+++dateNow', dateNow)
  console.log('+++jobId', jobId)
  console.log('+++response.statusCode', response.statusCode)
  console.log('+++response.body', response.body)

  const priceList = new PriceList()
  const lambdaPricing = await priceList.getLambdaPricing()
  const sqsPricing = await priceList.getSQSPricing()
  const s3Pricing = await priceList.getS3Pricing()
  const priceCalculator = new PriceCalculator(
    lambdaPricing, sqsPricing, s3Pricing
  )

  // TODO: set budget limit beforehand
  const flagPole = new FlagPoleService(jobId, budgetLimit, {
    REDIS_HOST,
    REDIS_PORT,
    REDIS_PASSWORD
  })

  // fetchTracePeriodically(dateNow, jobId)
  calculateJobCostsPeriodically({
    jobStartTime: dateNow,
    jobId,
    priceCalculator,
    flagPole,
  })

  res.status(HttpStatus.OK).json({
    jobUrl,
    jobId,
    dateNow,
    tracingUrl: `http://localhost:8080/test-job-tracing-summary/${dateNow}/${jobId}`
  })
}

const getJobStatus = async (req, res) => {
  const { jobId } = req.params

  console.log('+++jobId', jobId)

  const priceList = new PriceList()
  const lambdaPricing = await priceList.getLambdaPricing()
  const sqsPricing = await priceList.getSQSPricing()
  const s3Pricing = await priceList.getS3Pricing()
  const priceCalculator = new PriceCalculator(
    lambdaPricing, sqsPricing, s3Pricing
  )

  const {
    lambdaPrices,
    sqsPrices,
    s3Prices,
    totalJobPrice,
    totalJobPriceInUSD,
  } = await calculateJobCostsFromRedis({
    jobId,
    priceCalculator,
  })

  res.status(HttpStatus.OK).json({
    jobId,
    lambdaPrices,
    sqsPrices,
    s3Prices,
    totalJobPrice,
    totalJobPriceInUSD,
  })
}

export default {
  registerApp,
  startTracing,
  getJobStatus,
}
