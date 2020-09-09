import express from 'express'
import bodyParser from 'body-parser'
import HttpStatus from 'http-status-codes'
import { get } from 'lodash'
import moment from 'moment'
import fs from 'fs'
import multer from 'multer'
import Redis from 'ioredis'

import DynamoDB from './service/trace-store/dynamo'
import AppRegisterDynamoDB from './service/app-register-store/dynamo'
import PriceList from './service/cost-control/price-list'
import Tracer from './service/tracer'

import controller from './controller'

import {
  createServiceTracingMap,
} from './service/cost-control/utils'

const serialize = (object) => JSON.stringify(object, null, 2)

const port = process.env.PORT || 3000

export const {
  REDIS_URL = 'redis://localhost:6379',
  REDIS_HOST = '127.0.0.1',
  REDIS_PORT = 6379,
  REDIS_PASSWORD,
} = process.env

console.log('REDIS VARS:', {
  REDIS_URL,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
})

const traceStore = new DynamoDB('trace-record')
const priceList = new PriceList()
const tracer = new Tracer()
// const redisClient = new Redis('redis://')

async function fetchTracePeriodically(dateNow, jobId) {
  // TODO: to measure trace fetching delay
  const pollPeriodinMs = 200
  const counter = {
    value: 0,
  }

  // delay it for 1 sec
  await new Promise((resolve) => setTimeout(() => {
    console.log('#### wait for 1 sec')
    resolve()
  }, 1000))
  while (counter.value < 30) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, pollPeriodinMs))
    const startTime = dateNow / 1000
    const endTime = Date.now() / 1000
    // eslint-disable-next-line no-await-in-loop
    const traceSummary = await tracer.getXRayTraceSummaries(startTime, endTime, jobId)

    const traceCloseTimeStampAnnotation = get(traceSummary, 'TraceSummaries[0].Annotations.currentTimeStamp[0].AnnotationValue.NumberValue', undefined)

    console.log('+++traceCloseTimeStampAnnotation', traceCloseTimeStampAnnotation)

    const currentTimeStamp = moment.utc().valueOf()
    console.log('+++currentTimeStamp', currentTimeStamp)

    const traceResult = {
      jobStartTimeStamp: dateNow,
      arn: get(traceSummary, 'TraceSummaries[0].ResourceARNs[0].ARN', undefined),
      traceCloseTimeStamp: traceCloseTimeStampAnnotation,
      currentTimeStamp,
      elapsedTimeFromClosingTraceToNow: currentTimeStamp - traceCloseTimeStampAnnotation,
    }

    console.log('+++traceSummary.TraceSummaries', traceSummary.TraceSummaries)

    // TODO: remove break statement => only for first fetch to record trace delay
    counter.value++
    if (traceSummary.TraceSummaries.length > 0) {
      console.log('+++traceSummaryArray', traceResult, { pollPeriodinMs })
      fs.appendFileSync(
        'traceFetchingDelays.csv',
        `\n${traceResult.jobStartTimeStamp}, ${traceResult.arn}, ${traceResult.traceCloseTimeStamp}, ${traceResult.currentTimeStamp}, ${traceResult.elapsedTimeFromClosingTraceToNow}`,
      )
      break
    }
  }
}
const upload = multer({ dest: 'uploads/' })
const app = express()

// for parsing application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }))

// for parsing application/json
app.use(bodyParser.text({
  type: ['json', 'text']
}))

// for parsing multipart/form-data
// app.use(express.static('public'))

app.get('/ping', (req, res) => res.status(200).json({
  pong: 'Hello world!',
}))

/* Example curls:
curl -X POST http://localhost:8080/start-tracing
curl -X POST http://localhost:8080/start-tracing -H "Content-Type: application/json" -d '{"jobUrl": "hello:world"}'
*/
/**
 * start serverless big data processing tracing endpoint
 *
 * @param {string} jobUrl - start endpoint of the serverless big data processing job
 * @param {string} appId - to read app configuration from store for pricing calculation
 * @param {string} jobBudget - max budget of big data processing app
 *
 * @returns {object}
*/
app.post('/start-tracing', controller.startTracing)

/**
 * stop serverless big data processing tracing endpoint
*/
app.post('/stop', () => {

})

// example curl: curl -i -X POST -H "Content-Type: multipart/form-data" -F "data=@./lambda_gsd_index_calculator/.serverless/cloudformation-template-update-stack.json" -F "userid=1234" http://localhost:8080/register-app
app.post('/register-app', upload.single('data'), controller.registerApp)

app.get('/job-status/:jobId', controller.getJobStatus)

// **************
// TEST ROUTES!?!

// Redis
app.post('/redis-test', async (req, res) => {
  console.log('+++data', req.body)
  // const test = await redisClient.set('hello', 'world')
  // console.log('+++test', test)

  // const test2 = await redisClient.get('hello')
  // console.log('+++test2', test2)

  const ec2RedisClient = new Redis({
    port: REDIS_PORT, // Redis port
    host: REDIS_HOST, // Redis host
    family: 4, // 4 (IPv4) or 6 (IPv6)
    password: REDIS_PASSWORD,
    db: 0,
  })
  const test = await ec2RedisClient.set('hello', 'world')
  console.log('+++test', test)
  const test2 = await ec2RedisClient.get('hello')
  console.log('+++test2', test2)
  res.status(HttpStatus.CREATED).json({
    hello: 'world'
  })
})

// AWS DynamoDB
app.post('/test-put-db', async (req, res) => {
  console.log('+++data', req.body)
  const createdItem = await traceStore.put('test')
  console.log('+++createdItem', createdItem)
  res.status(HttpStatus.CREATED).json({
    hello: 'world'
  })
})

app.get('/test-get-db', async (req, res) => {
  const createdItem = await traceStore.get()
  console.log('+++createdItem', createdItem)
  res.status(HttpStatus.OK).json({
    hello: 'world'
  })
})

app.get('/test-get-app/:appId', async (req, res) => {
  const { appId } = req.params
  const appRegisterStore = new AppRegisterDynamoDB('app-register-store')
  const app = await appRegisterStore.get(appId)
  console.log('+++app', app)
  res.status(HttpStatus.OK).json({
    hello: 'world'
  })
})

// AWS Price List Service API
// Get product details with AttributeNames
app.get('/test-get-products', async (req, res) => {
  const response = await priceList.describeServices()
  console.log('+++response', response)
  console.log('+++ServiceAWSLambda', response.Services.find((srvc) => srvc.ServiceCode === 'AWSLambda'))
  console.log('+++ServiceAmazonDynamoDB', response.Services.find((srvc) => srvc.ServiceCode === 'AmazonDynamoDB'))
  console.log('+++ServiceAWSQueueService', response.Services.find((srvc) => srvc.ServiceCode === 'AWSQueueService'))

  console.log('+++describeLambdaServices', (await priceList.describeLambdaServices()).Services[0])
  res.status(HttpStatus.OK).json({
    hello: 'world'
  })
})

// Get product pricing
/* Example curl:
curl http://localhost:8080/test-get-product-prices/lambda
*/
app.get('/test-get-product-prices/:service', async (req, res) => {
  const { service } = req.params
  let response
  switch (service) {
    case 'lambda':
      response = await priceList.getLambdaPricing()
      break
    case 's3':
      response = await priceList.getS3Pricing()
      break
    case 'sqs':
      response = await priceList.getSQSPricing()
      break
    default:
      break
  }

  console.log(`+++response ${service}`, serialize(response))

  res.status(HttpStatus.OK).json({
    hello: 'world'
  })
})

// Get xray data based on traceId
/* Example curl:
curl http://localhost:8080/test-get-xraydata/1-5f05866b-d70cfffe81bd667ecb5bab3a,1-5f058594-b735a8ec4f0aa1ee3eea48a0
*/
app.get('/test-get-xraydata/:traceIds', async (req, res) => {
  const traceIds = req.params.traceIds.split(',')
  console.log('+++traceIds', traceIds)
  // const traceIds = ['1-5efdc64d-851fcc5c2219f4c03a07f6c8']
  const traceData = await tracer.getXRayTraces(traceIds)

  console.log('+++traceData', serialize(traceData))

  // const counter = {
  //   value: 0
  // }

  // const intervalRefId = setInterval(() => {
  //   console.log('+++counter.value', counter, intervalRefId)
  //   counter.value++

  //   //
  //   if (counter.value === 10) {
  //     clearInterval(intervalRefId)
  //     res.status(HttpStatus.OK).json({
  //       hello: 'world'
  //     })
  //   }
  // }, 500)

  res.status(HttpStatus.OK).json({
    hello: 'world'
  })
})

app.get('/test-batch-get-xraydata/:traceIds', async (req, res) => {
  const traceIds = req.params.traceIds.split(',')
  const traceData = await tracer.batchGetXrayTraces(traceIds)
  console.log('+++traceData', serialize(traceData))
  res.status(HttpStatus.OK).json({
    hello: 'world'
  })
})

// Get xray data based on start time of job
/* Example curl:
curl http://localhost:8080/test-get-xraysummary/1594201705424
*/
app.get('/test-get-xraysummary/:startTime', async (req, res) => {
  // Dateformat in traces are like: 1593786073.729
  // const startTime = 1594197396137 / 1000
  const startTime = parseInt(req.params.startTime, 10) / 1000
  const endTime = Date.now() / 1000
  const traceData = await tracer.getXRayTraceSummaries(startTime, endTime)
  console.log('+++traceData++++', traceData)
  console.log('+++traceData', serialize(traceData))
  const lambdaDurations = traceData.TraceSummaries
    .filter((trace) => get(trace, 'Annotations.serviceType[0].AnnotationValue.StringValue', '') === 'AWSLambda')
    .map((trace) => trace.Duration)
  console.log('+++lambdaDurations', lambdaDurations)
  res.status(HttpStatus.OK).json({
    hello: 'world'
  })
})

// app.get('/test-get-xray-service-graph/:startTime', async (req, res) => {
//   // Dateformat in traces are like: 1593786073.729
//   // const startTime = 1594197396137 / 1000
//   const startTime = parseInt(req.params.startTime, 10) / 1000
//   const endTime = Date.now() / 1000
//   const traceData = await tracer.getXRayServiceGraph(startTime, endTime)
//   console.log('+++getXRayServiceGraph++++', traceData)
//   console.log('+++getXRayServiceGraph', serialize(traceData))
//   res.status(HttpStatus.OK).json({
//     hello: 'world'
//   })
// })

/* Example curl:
curl http://localhost:8080/test-job-tracing-summary/:startTime/:jobId
*/

app.get('/test-job-tracing-summary/:jobStartTime/:jobId', async (req, res) => {
  const { jobId, jobStartTime } = req.params
  const startTime = parseInt(jobStartTime, 10) / 1000

  const allTraceSegments = await tracer.getFullTrace(jobId, startTime)

  // lambda
  const lambdaPrices = await priceList.calculateLambdaPrice(allTraceSegments)

  // sqs
  const sqsPrices = await priceList.calculateSqsPrice(allTraceSegments)

  // s3
  const s3Prices = await priceList.calculateS3Price(allTraceSegments)

  const totalJobPrice = lambdaPrices + sqsPrices + s3Prices
  console.log('+++totalJobPrice in Nano USD', {
    'Lambda total price': lambdaPrices,
    'SQS total price': sqsPrices,
    'S3 total price': s3Prices,
    'Job price in Nano USD': totalJobPrice,
    'Job price in USD': Number(`${totalJobPrice}e-9`),
  })

  // other traced services
  const filteredServiceTraceList = createServiceTracingMap(allTraceSegments)
  console.log('+++tracingMap', filteredServiceTraceList)

  res.status(HttpStatus.OK).json({
    totalPrice: lambdaPrices + sqsPrices
  })
})

// TEST ROUTES!?!
// **************

app.listen(
  port,
  () => console.log(`App listening at http://localhost:${port}`),
)

export default app
