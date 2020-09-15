import HttpStatus from 'http-status-codes'
import { get, set, isEmpty } from 'lodash'
import uuid from 'node-uuid'
import superagent from 'superagent'
import fs from 'fs'
import Redis from 'ioredis'
import moment from 'moment'

import AppRegisterStore from './service/app-register-store/dynamo'
import JobTraceStore from './service/job-trace-store/dynamo'
import PriceList from './service/cost-control/price-list'
import XRayTracer from './service/tracer/xray-tracer'
import RedisTracer from './service/tracer/redis-tracer'
import PriceCalculator from './service/cost-control/price-calculator'
import FlagPoleService from './service/cost-control/flag-pole'
import Notifier from './service/notification/notifier'

// import { fetchTracePeriodically } from './utils'

const {
  REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_CONNECTION,
} = process.env

const redisParams = {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  REDIS_CONNECTION,
}

const appRegisterStore = new AppRegisterStore()
const jobTraceStore = new JobTraceStore()
const xrayTracer = new XRayTracer()
const redisTracer = new RedisTracer(redisParams)

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

  const createdItem = await appRegisterStore.put(cloudFormationData)
  console.log('+++createdItem', createdItem)

  res.status(HttpStatus.CREATED).json(createdItem)
}

const calculateJobCostsWithXRay = async ({
  jobStartTime,
  jobId,
  priceCalculator,
  flagPole,
  iterationNumber,
}) => {
  const startTime = parseInt(jobStartTime, 10) / 1000
  const allTraceSegments = await xrayTracer.getFullTrace(jobId, startTime)

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
  queueMap,
  jobStartTime,
  budgetLimit = 0,
  eventBus,
  skipNotifying,
}) => {
  const lambdaTrace = await redisTracer.getLambdaTrace(jobId)
  const lambdaPrices = priceCalculator.calculateLambdaPrice(lambdaTrace, true)

  const sqsTrace = await redisTracer.getSqsTrace(jobId, queueMap)
  const { standard, fifo } = sqsTrace
  const sqsPrices = priceCalculator.calculateSqsPrice(standard, fifo, true)

  const s3Trace = await redisTracer.getS3Trace(jobId)
  const s3Prices = priceCalculator.calculateS3Price(s3Trace, true)

  console.log('+++pricingFromRedis', {
    sqsPrices,
    lambdaPrices,
    s3Prices,
  })

  const totalJobPrice = lambdaPrices + sqsPrices + s3Prices
  const totalJobPriceInUSD = Number(`${totalJobPrice}e-9`)

  const isInBudgetLimit = await flagPole.isInBudgetLimit(totalJobPriceInUSD, skipNotifying)

  const startTime = parseInt(jobStartTime, 10) / 1000
  const timePassedSinceJobStartInSec = parseFloat((Date.now() / 1000) - startTime).toFixed(2)

  const result = {
    iterationNumber,
    lambdaPrices,
    sqsPrices,
    s3Prices,
    totalJobPrice,
    totalJobPriceInUSD,
    formatedTimePassedSinceJobStart: moment.utc(timePassedSinceJobStartInSec * 1000).format('HH:mm:ss.SSS'),
    budgetLimit,
  }

  console.log('+++totalJobPriceFromRedis in Nano USD', {
    iteration: iterationNumber,
    isInBudgetLimit,
    'Time passed since job start': timePassedSinceJobStartInSec,
    'Lambda total price': lambdaPrices,
    'SQS total price': sqsPrices,
    'S3 total price': s3Prices,
    'Job price in Nano USD': totalJobPrice,
    'Job price in USD': totalJobPriceInUSD,
  })

  // TODO: for testing purpose only
  const testFlag = await redisTracer.get(`TEST_FLAG#####${jobId}`)
  console.log('+++testFlag', testFlag)

  // if (testFlag > 2) {
  //   await redisTracer.set(`flag_${jobId}`, budgetLimit)
  // }

  eventBus.emit('job-costs-calculated', jobId, result)

  return result
}

async function calculateJobCostsPeriodically(passedArgs) {
  const pollPeriodinMs = 500
  const counter = { value: 0 }

  // delay it for 1 sec
  // await new Promise((resolve) => setTimeout(() => {
  //   console.log('#### wait for 1 sec')
  //   resolve()
  // }, 1000))

  while (counter.value < 30) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, pollPeriodinMs))

    const args = {
      ...passedArgs,
      iterationNumber: counter.value,
    }

    // calculateJobCostsWithXRay(args)
    calculateJobCostsFromRedis(args)
    counter.value++
  }
}

// TODO: *** Redis Keyspace notification
const redisKeyspaceNotificationSubscriberClient = REDIS_CONNECTION
  ? new Redis(REDIS_CONNECTION)
  : new Redis({
    port: REDIS_PORT,
    host: REDIS_HOST,
    family: 4,
    password: REDIS_PASSWORD,
    db: 0,
  })

const redisClient = REDIS_CONNECTION
  ? new Redis(REDIS_CONNECTION)
  : new Redis({
    port: REDIS_PORT,
    host: REDIS_HOST,
    family: 4,
    password: REDIS_PASSWORD,
    db: 0,
  })

// redisKeyspaceNotificationSubscriberClient.on('ready', () => {
// redisKeyspaceNotificationSubscriberClient.config(
//   'set', 'notify-keyspace-events', 'KEA',
// )
// })

redisKeyspaceNotificationSubscriberClient.config('set', 'notify-keyspace-events', 'KEA')

redisKeyspaceNotificationSubscriberClient.psubscribe('__keyevent@0__:*')
redisKeyspaceNotificationSubscriberClient.on('pmessage', async (pattern, channel, message) => {
  console.log('+++channel, message', { pattern, channel, message })
  const command = channel.split(':')[1]

  console.log('+++command', command)

  if (command === 'set') {
    const redisTsValue = await redisClient.get(message)
    const passedTime = moment.utc().valueOf() - redisTsValue
    console.log('+++passedTimeSinceTrace', redisTsValue, passedTime)
  }
})

const initPriceCalculator = async () => {
  const priceList = new PriceList()
  const lambdaPricing = await priceList.getLambdaPricing()
  const sqsPricing = await priceList.getSQSPricing()
  const s3Pricing = await priceList.getS3Pricing()
  const priceCalculator = new PriceCalculator(
    lambdaPricing, sqsPricing, s3Pricing
  )

  return priceCalculator
}

const getRegisteredSqsQueuesMap = async (appId) => (appId ? get(await appRegisterStore.get(appId), 'sqs', {}) : {})

const startTracing = (eventBus) => async (req, res) => {
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
  const registeredSqsQueuesMap = await getRegisteredSqsQueuesMap(appId)

  // TODO: set budget limit beforehand
  const flagPole = new FlagPoleService(jobId, budgetLimit, redisParams, notifier)

  // store job details
  const dateNow = Date.now()
  await jobTraceStore.put({
    jobId,
    jobUrl,
    budgetLimit,
    appId,
    jobStartTime: dateNow,
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

  // fetchTracePeriodically(xRayTracer, dateNow, jobId)
  calculateJobCostsPeriodically({
    jobStartTime: dateNow,
    jobId,
    priceCalculator,
    flagPole,
    queueMap: registeredSqsQueuesMap,
    budgetLimit,
    eventBus,
  })

  res.status(HttpStatus.OK).json({
    jobUrl,
    jobId,
    dateNow,
    tracingUrl: `http://localhost:8080/test-job-tracing-summary/${dateNow}/${jobId}`
  })
}

export const getJobStatus = async ({
  eventBus,
  jobId,
}) => {
  const priceCalculator = await initPriceCalculator()

  const jobRecord = await jobTraceStore.get(jobId)
  const budgetLimit = get(jobRecord, 'budgetLimit', 0)
  const jobStartTime = get(jobRecord, 'jobStartTime')
  const appId = get(jobRecord, 'appId')
  const registeredSqsQueuesMap = await getRegisteredSqsQueuesMap(appId)
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
    eventBus,
    skipNotifying: true,
    jobStartTime,
    budgetLimit,
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

const getJobStatusRouteHandler = (eventBus) => async (req, res) => {
  const { jobId, appId = '' } = req.params

  console.log('+++jobId', { jobId, appId })

  const jobCostDetails = await getJobStatus({ jobId, eventBus })

  res.status(HttpStatus.OK).json(jobCostDetails)
}

const getRegisteredApp = async (req, res) => {
  const { appId } = req.params
  console.log('+++appId', appId)

  const registeredApp = await appRegisterStore.get(appId)

  res.status(HttpStatus.OK).json(registeredApp)
}

const getJobRecord = async (req, res) => {
  const { jobId } = req.params
  console.log('+++jobId', jobId)

  const jobRecord = await jobTraceStore.get(jobId)

  res.status(HttpStatus.OK).json(jobRecord)
}

export default {
  registerApp,
  startTracing,
  getJobStatusRouteHandler,
  getRegisteredApp,
  getJobRecord,
}
