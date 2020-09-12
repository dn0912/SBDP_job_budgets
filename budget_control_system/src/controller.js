import HttpStatus from 'http-status-codes'
import { get, set, isEmpty } from 'lodash'
import uuid from 'node-uuid'
import superagent from 'superagent'
import fs from 'fs'
import Redis from 'ioredis'

import AppRegisterStore from './service/app-register-store/dynamo'
import JobTracerStore from './service/job-trace-store/dynamo'
import PriceList from './service/cost-control/price-list'
import Tracer from './service/tracer'
import PriceCalculator from './service/cost-control/price-calculator'
import FlagPoleService from './service/cost-control/flag-pole'
import Notifier from './service/notification/notifier'

const {
  REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_CONNECTION,
} = process.env

const redisParams = {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  REDIS_CONNECTION,
}

const priceList = new PriceList()
const appRegisterStore = new AppRegisterStore()
const jobTraceStore = new JobTracerStore()
const tracer = new Tracer()
const redisTracerCache = REDIS_CONNECTION
  ? new Redis(REDIS_CONNECTION)
  : new Redis({
    port: REDIS_PORT,
    host: REDIS_HOST,
    family: 4,
    password: REDIS_PASSWORD,
    db: 0,
  })

const notifier = new Notifier()

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

  // const appId = `app-${uuid.v4()}`
  // const storeItem = {
  //   appId,
  //   ...cloudFormationData,
  // }
  const createdItem = await appRegisterStore.put(cloudFormationData)
  console.log('+++createdItem', createdItem)

  res.status(HttpStatus.CREATED).json(createdItem)
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

// Key format: tracer_{jobId}#{serviceType}#{serviceMethod}
const REDIS_CACHE_KEY_PREFIX = 'tracer_'

const getLambdaTraceAndCalculatePrice = async (priceCalculator, jobId) => {
  const tracedLambdaCacheKey = `${REDIS_CACHE_KEY_PREFIX}${jobId}#lambda`
  console.log('+++tracedLambdaCacheKey', tracedLambdaCacheKey)
  const tracedLambdaCacheEntry = (await redisTracerCache.lrange(tracedLambdaCacheKey, 0, -1) || [])

  const tracedLambdaSegments = tracedLambdaCacheEntry.map((delimitedString) => {
    const [memoryAllocationInMB, processingTimeString] = delimitedString.split('::')
    return {
      memoryAllocationInMB: Number(memoryAllocationInMB),
      processingTime: Number(processingTimeString),
    }
  })

  console.log('+++tracedLambdaCacheEntry', tracedLambdaCacheEntry)
  const lambdaPrices = priceCalculator.calculateLambdaPrice(tracedLambdaSegments, true)
  return lambdaPrices
}

const getSqsTraceAndCalculatePrice = async (priceCalculator, jobId, queueMap) => {
  let sqsPrices
  const availableQueues = Object.keys(queueMap)
  if (availableQueues.length > 0) {
    const { standardQueueChunks, fifoQueueChunks } = await availableQueues
      .reduce(async (prevPromise, queueName) => {
        const acc = await prevPromise
        const queueType = get(queueMap, `${queueName}.queueType`, 'standard')

        if (queueType === 'fifo') {
          // get amount of sqs msg chunks from redis cache
          // NOTE: FiFo queues must have fifo suffix in queueName
          const tracedSqsChunks = Number(await redisTracerCache.get(`${REDIS_CACHE_KEY_PREFIX}${jobId}#sqs#${queueName}.fifo`)) || 0

          set(acc, 'fifoQueueChunks', acc.fifoQueueChunks + tracedSqsChunks)
        } else {
          // get amount of sqs msg chunks from redis cache
          const tracedSqsChunks = Number(await redisTracerCache.get(`${REDIS_CACHE_KEY_PREFIX}${jobId}#sqs#${queueName}`)) || 0
          set(acc, 'standardQueueChunks', acc.standardQueueChunks + tracedSqsChunks)
        }

        return acc
      }, {
        standardQueueChunks: 0,
        fifoQueueChunks: 0,
      })
    sqsPrices = priceCalculator.calculateSqsPrice(standardQueueChunks, fifoQueueChunks, true)
  } else {
    const tracedSqsChunks = Number(await redisTracerCache.get(`${REDIS_CACHE_KEY_PREFIX}${jobId}#sqs`)) || 0
    sqsPrices = priceCalculator.calculateSqsPrice(tracedSqsChunks, null, true)
  }
  return sqsPrices
}

const getS3TraceAndCalculatePrice = async (priceCalculator, jobId) => {
  // returns amount of method calls
  const tracedS3GetObjectCallsCacheKey = `${REDIS_CACHE_KEY_PREFIX}${jobId}#s3#getObject`
  const tracedS3GetObjectCalls = Number(
    await redisTracerCache.get(tracedS3GetObjectCallsCacheKey)
  ) || 0

  // returns array of file sizes
  const tracedS3PutObjectCallsCacheKey = `${REDIS_CACHE_KEY_PREFIX}${jobId}#s3#putObject`
  const tracedS3PutObjectCalls = await redisTracerCache
    .lrange(tracedS3PutObjectCallsCacheKey, 0, -1) || []
  const tracedS3PutObjectFileSizeArray = tracedS3PutObjectCalls.map((str) => Number(str))

  console.log('+++getS3TraceAndCalculatePrice', {
    tracedS3GetObjectCalls,
    tracedS3PutObjectFileSizeArray,
  })

  const s3Prices = priceCalculator.calculateS3Price({
    fileSizesInKB: tracedS3PutObjectFileSizeArray,
    s3RequestsMap: {
      GetObject: tracedS3GetObjectCalls,
      PutObject: tracedS3PutObjectFileSizeArray.length,
    }
  }, true)

  return s3Prices
}

const calculateJobCostsFromRedis = async ({
  jobId,
  priceCalculator,
  flagPole,
  iterationNumber = 0,
  queueMap,
  jobStartTime,
  budgetLimit = 0,
}) => {
  const lambdaPrices = await getLambdaTraceAndCalculatePrice(priceCalculator, jobId)
  const sqsPrices = await getSqsTraceAndCalculatePrice(priceCalculator, jobId, queueMap)
  const s3Prices = await getS3TraceAndCalculatePrice(priceCalculator, jobId)

  console.log('+++pricingFromRedis', {
    sqsPrices,
    lambdaPrices,
    s3Prices,
  })

  const totalJobPrice = lambdaPrices + sqsPrices + s3Prices
  const totalJobPriceInUSD = Number(`${totalJobPrice}e-9`)

  const isInBudgetLimit = await flagPole.isInBudgetLimit(totalJobPriceInUSD)

  const result = {
    iterationNumber,
    lambdaPrices,
    sqsPrices,
    s3Prices,
    totalJobPrice,
    totalJobPriceInUSD,
  }

  const startTime = parseInt(jobStartTime, 10) / 1000

  console.log('+++totalJobPriceFromRedis in Nano USD', {
    iteration: iterationNumber,
    isInBudgetLimit,
    'Time passed since job start': (Date.now() / 1000) - startTime,
    'Lambda total price': lambdaPrices,
    'SQS total price': sqsPrices,
    'S3 total price': s3Prices,
    'Job price in Nano USD': totalJobPrice,
    'Job price in USD': totalJobPriceInUSD,
  })

  // TODO: for testing purpose only
  const testFlag = await redisTracerCache.get(`TEST_FLAG#####${jobId}`)
  console.log('+++testFlag', testFlag)

  if (testFlag > 2) {
    await redisTracerCache.set(`flag_${jobId}`, budgetLimit)
  }

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
    // calculateJobCosts(args)
    calculateJobCostsFromRedis(args)
    counter.value++
  }
}

const initPriceCalculator = async () => {
  const lambdaPricing = await priceList.getLambdaPricing()
  const sqsPricing = await priceList.getSQSPricing()
  const s3Pricing = await priceList.getS3Pricing()
  const priceCalculator = new PriceCalculator(
    lambdaPricing, sqsPricing, s3Pricing
  )

  return priceCalculator
}

const startTracing = async (req, res) => {
  console.log('+++req.body', req.body)
  const jobId = uuid.v4()
  let jobUrl = process.env.TEMP_JOB_URL
  let budgetLimit = 0.025
  let appId

  if (!isEmpty(req.body)) {
    const requestBody = JSON.parse(req.body)
    jobUrl = get(requestBody, 'jobUrl', jobUrl)
    budgetLimit = Number(get(requestBody, 'budgetLimit', budgetLimit))
    appId = get(requestBody, 'appId')
  }

  const priceCalculator = await initPriceCalculator()
  const registeredSqsQueuesMap = appId ? get(await appRegisterStore.get(appId), 'sqs', {}) : {}

  // TODO: set budget limit beforehand
  const flagPole = new FlagPoleService(jobId, budgetLimit, redisParams, notifier)

  const dateNow = Date.now()
  await jobTraceStore.put({
    jobId,
    jobUrl,
    budgetLimit,
    appId,
    dateNow,
  })

  // TRIGGER THE JOB
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

  console.log('+++registeredSqsQueuesMap', registeredSqsQueuesMap)

  // fetchTracePeriodically(dateNow, jobId)
  calculateJobCostsPeriodically({
    jobStartTime: dateNow,
    jobId,
    priceCalculator,
    flagPole,
    queueMap: registeredSqsQueuesMap,
    budgetLimit,
  })

  res.status(HttpStatus.OK).json({
    jobUrl,
    jobId,
    dateNow,
    tracingUrl: `http://localhost:8080/test-job-tracing-summary/${dateNow}/${jobId}`
  })
}

export const getJobStatus = async (jobId, appId = '') => {
  const priceCalculator = await initPriceCalculator()
  const registeredSqsQueuesMap = appId ? await appRegisterStore.get(appId) : {}

  const jobRecord = await jobTraceStore.get(jobId)
  const budgetLimit = get(jobRecord, 'budgetLimit', 0)
  console.log('+++jobRecord', jobRecord)

  const flagPole = new FlagPoleService(jobId, budgetLimit, redisParams, notifier)

  const {
    lambdaPrices,
    sqsPrices,
    s3Prices,
    totalJobPrice,
    totalJobPriceInUSD,
  } = await calculateJobCostsFromRedis({
    jobId,
    priceCalculator,
    flagPole,
    queueMap: registeredSqsQueuesMap,
  })

  return {
    jobId,
    lambdaPrices,
    sqsPrices,
    s3Prices,
    totalJobPrice,
    totalJobPriceInUSD,
  }
}

const getJobStatusRouteHandler = async (req, res) => {
  const { jobId, appId = '' } = req.params

  console.log('+++jobId', { jobId, appId })

  const jobCostDetails = await getJobStatus(jobId, appId)

  res.status(HttpStatus.OK).json(jobCostDetails)
}

export default {
  registerApp,
  startTracing,
  getJobStatusRouteHandler,
}
