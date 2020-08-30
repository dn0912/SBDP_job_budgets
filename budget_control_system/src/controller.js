import HttpStatus from 'http-status-codes'
import { set } from 'lodash'
import uuid from 'node-uuid'
import superagent from 'superagent'
import fs from 'fs'

import DynamoDB from './service/trace-store/dynamo'
import PriceList from './service/cost-control/price-list'
import Tracer from './service/tracer'
import PriceCalculator from './service/cost-control/price-calculator'
import FlagPoleService from './service/cost-control/flag-pole'

const appRegisterStore = new DynamoDB('app-register-store')
const tracer = new Tracer()

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

const calculateJobCosts = async (
  jobStartTime,
  jobId,
  priceCalculator,
  flagPole,
  iterationNumber,
) => {
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
    'time passed since job start': (Date.now() / 1000) - startTime,
    'Lambda total price': lambdaPrices,
    'SQS total price': sqsPrices,
    'S3 total price': s3Prices,
    'Job price in Nano USD': totalJobPrice,
    'Job price in USD': totalJobPriceInUSD,
  })
}

async function calculateJobCostsPeriodically(...args) {
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

    // eslint-disable-next-line no-await-in-loop
    calculateJobCosts(...args, counter.value)
    counter.value++
  }
}

const startTracing = async (req, res) => {
  const {
    jobUrl = 'https://17d8y590d2.execute-api.eu-central-1.amazonaws.com/dev/start-job'
  } = JSON.parse(req.body)
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
  const budgetLimit = 0.025
  const flagPole = new FlagPoleService(jobId, budgetLimit)

  // fetchTracePeriodically(dateNow, jobId)
  calculateJobCostsPeriodically(
    dateNow,
    jobId,
    priceCalculator,
    flagPole,
  )

  res.status(HttpStatus.OK).json({
    jobUrl,
    jobId,
    dateNow,
    tracingUrl: `http://localhost:8080/test-job-tracing-summary/${dateNow}/${jobId}`
  })
}

export default {
  registerApp,
  startTracing,
}
