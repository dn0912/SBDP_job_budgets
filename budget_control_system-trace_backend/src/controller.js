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
import RedisTracer, { REDIS_CACHE_KEY_PREFIX } from './service/tracer/redis-tracer'
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
  console.log('>>> cloudFormationData', cloudFormationData)
  console.log('>>> createdItem', createdItem)
  res.status(HttpStatus.CREATED).json(createdItem)
}

const calculateJobCostsWithXRay = async ({
  jobStartTime,
  jobId,
  priceCalculator,
  iterationNumber,
  budgetLimit,
  flagPole,
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

  const isInBudgetLimit = await flagPole.isInBudgetLimit(jobId, budgetLimit, totalJobPriceInUSD)

  console.log('>>> totalJobPrice in Nano USD', {
    iteration: iterationNumber,
    isInBudgetLimit,
    'Budget limit': budgetLimit,
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
  iterationNumber,
  queueMap,
  jobStartTime,
  budgetLimit = 0,
  eventBus,
  skipNotifying,
  metaData,
  flagPole,
}) => {
  const lambdaTrace = await redisTracer.getLambdaTrace(jobId)
  const lambdaPrices = priceCalculator.calculateLambdaPrice(lambdaTrace, true)

  const sqsTrace = await redisTracer.getSqsTrace(jobId, queueMap)
  const { standard, fifo } = sqsTrace
  const sqsPrices = priceCalculator.calculateSqsPrice(standard, fifo, true)

  const s3Trace = await redisTracer.getS3Trace(jobId)
  const s3Prices = priceCalculator.calculateS3Price(s3Trace, true)

  const totalJobPrice = lambdaPrices + sqsPrices + s3Prices
  const totalJobPriceInUSD = Number(`${totalJobPrice}e-9`)

  const isInBudgetLimit = await flagPole.isInBudgetLimit(
    jobId,
    budgetLimit,
    totalJobPriceInUSD,
    skipNotifying,
  )

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
    metaData,
  }

  console.log('>>> totalJobPriceFromRedis in Nano USD', {
    jobId,
    iteration: iterationNumber,
    isInBudgetLimit,
    'Time passed since job start': timePassedSinceJobStartInSec,
    'Lambda total price': lambdaPrices,
    'SQS total price': sqsPrices,
    'S3 total price': s3Prices,
    'Job price in Nano USD': totalJobPrice,
    'Job price in USD': totalJobPriceInUSD,
  })

  eventBus.emit('job-costs-calculated', jobId, result)

  return result
}

async function calculateJobCostsPeriodically(passedArgs, periodInSecCalculation) {
  const counterThreshold = (periodInSecCalculation * 1000) / 500
  const pollPeriodinMs = 500
  const counter = { value: 0 }

  while (counter.value < counterThreshold) {
    // delay next poll
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

// *** Redis Keyspace notification
const redisClient = REDIS_CONNECTION
  ? new Redis(REDIS_CONNECTION)
  : new Redis({
    port: REDIS_PORT,
    host: REDIS_HOST,
    family: 4,
    password: REDIS_PASSWORD,
    db: 0,
  })
const redisKeyspaceNotificationSubscriberClient = REDIS_CONNECTION
  ? new Redis(REDIS_CONNECTION)
  : new Redis({
    port: REDIS_PORT,
    host: REDIS_HOST,
    family: 4,
    password: REDIS_PASSWORD,
    db: 0,
  })

redisKeyspaceNotificationSubscriberClient.config('set', 'notify-keyspace-events', 'KEA')

redisKeyspaceNotificationSubscriberClient.psubscribe('__keyevent@0__:*')

// Job initiator service
const startJobAndTrace = async (eventBus, additionalData) => {
  const jobId = uuid.v4()
  let jobUrl = process.env.TEMP_JOB_URL
  let budgetLimit = 0
  let appId
  let periodInSecCalculation

  if (!isEmpty(additionalData)) {
    jobUrl = get(additionalData, 'jobUrl', jobUrl)
    budgetLimit = Number(get(additionalData, 'budgetLimit', budgetLimit))
    appId = get(additionalData, 'appId')
    periodInSecCalculation = get(additionalData, 'periodInSec')
  }

  const priceCalculator = await initPriceCalculator()
  const registeredSqsQueuesMap = await getRegisteredSqsQueuesMap(appId)
  const flagPole = new FlagPoleService(redisParams, notifier)

  // store job details
  const dateNow = Date.now()
  await jobTraceStore.put({
    jobId,
    jobUrl,
    budgetLimit,
    appId,
    jobStartTime: dateNow,
  })

  // calculate per keyspace notification
  if (!periodInSecCalculation) {
    redisKeyspaceNotificationSubscriberClient.on('pmessage', async (pattern, channel, message) => {
      const redisCommand = channel.split(':')[1]

      // only for speed evaluation
      if (redisCommand === 'set' && message.startsWith('evaluation_arn:aws:lambda')) {
        const redisTsValue = await redisClient.get(message)
        const currentSystemTs = Date.now()
        const passedTime = currentSystemTs - redisTsValue
        // fs.appendFileSync(
        //   'evaluation/traceFetchingDelaysRedis_log.json',
        //   `\n{"arn": "${message}", "redisTsValue": ${redisTsValue}, "currentSystemTs": ${currentSystemTs}, "passedTime": ${passedTime}},`,
        // )
        fs.appendFile(
          'evaluation/traceFetchingDelaysRedis_log.csv',
          `\n${message}, ${redisTsValue}, ${currentSystemTs}, ${passedTime}`,
          (err) => {
            if (err) {
              throw err
            }
            console.log('The new_content was appended successfully')
          }
        )
      }

      // every operation on the trace store
      if (message.startsWith(`${REDIS_CACHE_KEY_PREFIX}${jobId}`)) {
        // message format e.g.
        // tracer_356fe48b-d3c1-4be1-ac10-1d764a7612e3#s3#putObject
        const [
          cacheKeyPrefix,
          jobId,
          awsService,
          additionalData,
        ] = message.split(/[_|#]+/)

        calculateJobCostsFromRedis({
          jobStartTime: dateNow,
          jobId,
          priceCalculator,
          queueMap: registeredSqsQueuesMap,
          budgetLimit,
          eventBus,
          metaData: { awsService, additionalData },
          flagPole,
        })
      }
    })
  }

  // TRIGGER THE JOB
  const response = await superagent
    .post(jobUrl)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .send({
      jobId
    })

  console.log('>>> response.statusCode', response.statusCode)

  // calculate based on periodical polling for tracec data in cache
  if (typeof periodInSecCalculation === 'number' && periodInSecCalculation > 0) {
    // fetchTracePeriodically(xRayTracer, dateNow, jobId)
    calculateJobCostsPeriodically({
      jobStartTime: dateNow,
      jobId,
      priceCalculator,
      queueMap: registeredSqsQueuesMap,
      budgetLimit,
      eventBus,
      flagPole,
    }, periodInSecCalculation)
  }

  return {
    jobUrl,
    jobId,
    dateNow,
    tracingUrl: `http://localhost:8080/test-job-tracing-summary/${dateNow}/${jobId}`
  }
}

const startTracingRouteHandler = (eventBus) => async (req, res) => {
  let additionalData = {}

  if (!isEmpty(req.body)) {
    additionalData = JSON.parse(req.body)
  }

  const result = await startJobAndTrace(eventBus, additionalData)

  res.status(HttpStatus.OK).json(result)
}

const stopJobRouteHandler = async (req, res) => {
  if (!isEmpty(req.body)) {
    const requestBody = JSON.parse(req.body)
    const { jobId } = requestBody
    const flagPole = new FlagPoleService(redisParams, notifier)
    await flagPole.switchFlagAndStopJob(jobId)
    res.status(HttpStatus.OK).json({
      jobId,
    })
  } else {
    res.status(HttpStatus.OK)
  }
}

const getJobStatus = async ({
  eventBus,
  jobId,
}) => {
  const priceCalculator = await initPriceCalculator()

  const jobRecord = await jobTraceStore.get(jobId)
  const budgetLimit = get(jobRecord, 'budgetLimit', 0)
  const jobStartTime = get(jobRecord, 'jobStartTime')
  const appId = get(jobRecord, 'appId')
  const registeredSqsQueuesMap = await getRegisteredSqsQueuesMap(appId)

  const flagPole = new FlagPoleService(redisParams, notifier)

  const {
    lambdaPrices,
    sqsPrices,
    s3Prices,
    totalJobPrice,
    totalJobPriceInUSD,
  } = await calculateJobCostsFromRedis({
    jobId,
    priceCalculator,
    queueMap: registeredSqsQueuesMap,
    eventBus,
    skipNotifying: true,
    jobStartTime,
    budgetLimit,
    flagPole,
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

const subscribeToBudgetAlarm = async (req, res) => {
  let requestBody
  if (typeof req.body === 'string') {
    requestBody = JSON.parse(req.body)
  } else {
    requestBody = req.body
  }
  const { mail } = requestBody

  await notifier.subscribe(mail)

  console.log('>>> YOU NEED TO CONFIRM EMAIL')

  res.status(HttpStatus.CREATED).json({
    Note: 'YOU NEED TO CONFIRM EMAIL SUBSCRIPTION.',
    mail,
  })
}

const getJobStatusRouteHandler = (eventBus) => async (req, res) => {
  const { jobId } = req.params
  const jobCostDetails = await getJobStatus({ jobId, eventBus })

  res.status(HttpStatus.OK).json(jobCostDetails)
}

const getRegisteredApp = async (req, res) => {
  const { appId } = req.params
  const registeredApp = await appRegisterStore.get(appId)

  res.status(HttpStatus.OK).json(registeredApp)
}

const getJobRecord = async (req, res) => {
  const { jobId } = req.params
  const jobRecord = await jobTraceStore.get(jobId)

  res.status(HttpStatus.OK).json(jobRecord)
}

export default {
  registerApp,
  startTracingRouteHandler,
  getJobStatusRouteHandler,
  stopJobRouteHandler,
  getRegisteredApp,
  getJobRecord,
  subscribeToBudgetAlarm,
}

export {
  startJobAndTrace,
  getJobStatus,
}
