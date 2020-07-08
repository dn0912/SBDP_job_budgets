import express from 'express'
import bodyParser from 'body-parser'
import superagent from 'superagent'
import HttpStatus from 'http-status-codes'
import uuid from 'node-uuid'
import { get } from 'lodash'
import DynamoDB from './service/trace-store/dynamo'
import PriceList from './service/cost-control/price-list'
import Tracer from './service/tracer'

const serialize = (object) => JSON.stringify(object, null, 2)

const port = process.env.PORT || 3000

const traceStore = new DynamoDB()
const priceList = new PriceList()
const tracer = new Tracer()

const app = express()
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.text({
  type: ['json', 'text']
}))

app.get('/', (req, res) => res.status(200).json({
  hello: 'world!',
}))

/**
 * start serverless big data processing tracing endpoint
 *
 * @param {string} jobUrl - start endpoint of the serverless big data processing job
 *
 * @returns {object}
*/
app.post('/start-tracing', async (req, res) => {
  // const { jobUrl } = req.body
  const dateNowUnix = Date.now()
  const jobUrl = 'https://8horir8nei.execute-api.eu-central-1.amazonaws.com/dev/start-job'
  const jobId = uuid.v4()
  const response = await superagent
    .post(jobUrl)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .send({
      jobId
    })

  console.log('+++data', req.body)
  console.log('+++dateNowUnix', dateNowUnix)
  console.log('+++jobId', jobId)
  console.log('+++response.statusCode', response.statusCode)
  console.log('+++response.body', response.body)

  res.status(HttpStatus.OK).json({
    jobUrl,
    jobId,
    dateNowUnix,
  })
})

/**
 * stop serverless big data processing tracing endpoint
*/
app.post('/stop', () => {

})

// **************
// TEST ROUTES!?!

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
      response = await priceList.getLambdaProducts()
      break
    case 's3':
      response = await priceList.getS3Products()
      break
    case 'sqs':
      response = await priceList.getSQSProducts()
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

// TEST ROUTES!?!
// **************

app.listen(
  port,
  () => console.log(`App listening at http://localhost:${port}`),
)

export default app
