const TracedAWS = require('service-cost-tracer')
const Redis = require('ioredis')

const lambda = new TracedAWS.Lambda()

// const redisEndpoint = 'redis-test-cluster.9sjlaw.clustercfg.euc1.cache.amazonaws.com'
// const redisPort = 6379
// const redisClient = new Redis(redisPort, redisEndpoint)
const redisClient = new Redis('redis://redis-sbdp.9sjlaw.ng.0001.euc1.cache.amazonaws.com:6379')

const { promisify } = require('util')

const invokeLambda = promisify(lambda.invoke).bind(lambda)

/*
  https://aws.amazon.com/de/blogs/architecture/understanding-the-different-ways-to-invoke-lambda-functions/

  Manager needs to schedule the jobs based on data in S3:

  Asynchronous invocation to trigger multiple lambdas with further preprocessing and calculation
*/

// TODO: ONLY HELPER FUNCTION
const serialize = (object) => JSON.stringify(object, null, 2)

// TODO: remove later
// simulate slow function
const slowDown = async (ms) => {
  console.log(`+++Take it easy!?! ${ms} ms`)
  await new Promise(resolve => setTimeout(resolve, ms))
}

/*
  entry point of SBDP app with definition of
  1. which files should be processed by the preprocessed lambdas
  2. start job entry point
*/
module.exports.startJob = async (event, context) => {
  // *******
  // TRACING
  const eventBody = JSON.parse(event.body)
  const jobId = eventBody.jobId
  const lambdaSubsegment = TracedAWS.startLambdaTracer(context, jobId)
  // *******

  console.log('## ENVIRONMENT VARIABLES: ' + serialize(process.env))
  console.log('## CONTEXT: ' + serialize(context))
  console.log('## EVENT: ' + serialize(event))
  console.log('## eventbody: ' + event.body)

  // TODO: batch files based on batch size coming from request
  const inputArray = [
    // 'test_with_description_title_change_500_single.json',
    'test_with_description_title_change_1000_single.json',
    'test_with_description_title_change_1500_single.json',
    // 'test_with_description_title_change_2000_single.json', // TODO: throws some timeout errors
  ]

  console.log('+++inputArray', inputArray)

  // const promises = inputArray.map(fileName => {
  //   const payload = {
  //     fileName,
  //     jobId,
  //   }
  //   return invokeLambda({
  //     FunctionName: 'lambda-gsd-index-calculator-dev-preprocess1k',
  //     InvocationType: 'Event',
  //     Payload: JSON.stringify(payload),
  //   })
  // })

  // const result = await Promise.all(promises)
  // console.log('+++result', result)

  await slowDown((Math.floor(Math.random() * (30 - 10 + 1) + 10)) * 100)

  // TRACING
  console.log('+++hello start job')
  // // TODO: redis test
  const test = await redisClient.set(jobId, Date.now())
  console.log('+++test', test)

  const test2 = await redisClient.get(jobId)
  console.log('+++test2', test2)
  redisClient.disconnect()
  TracedAWS.stopLambdaTracer(lambdaSubsegment)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    // body: JSON.stringify(result),
    body: JSON.stringify({}),
  }
}
