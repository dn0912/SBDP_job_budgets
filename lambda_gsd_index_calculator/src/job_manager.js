const AWSXRay = require('aws-xray-sdk-core')
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
const moment = require('moment')

const lambda = new AWS.Lambda()

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
  console.log('+++Take it easy!?!')
  await new Promise(resolve => setTimeout(resolve, ms))
}

const startLambdaTracing = (jobId = 'dummyId', context) => {
  console.log('+++Start tracing - job manager')
  const segment = AWSXRay.getSegment()
  console.log('+++jobId', jobId)
  console.log('+++segment', segment)
  const subsegment = segment.addNewSubsegment('Cost tracer subsegment - Lambda: calculator')
  subsegment.addAnnotation('jobId', jobId)
  subsegment.addAnnotation('serviceType', 'AWSLambda')
  subsegment.addAnnotation('memoryAllocationInMB', context.memoryLimitInMB)
  console.log('+++subsegment', subsegment)

  return subsegment
}

const stopLambdaTracing = (lambdaSubsegment) => {
  lambdaSubsegment.addAnnotation('currentTimeStamp', moment.utc().valueOf())
  lambdaSubsegment.close()
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
  const lambdaTracingSubsegment = startLambdaTracing(jobId, context)
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

  const promises = inputArray.map(fileName => {
    const payload = {
      fileName,
      jobId,
    }
    return invokeLambda({
      FunctionName: 'lambda-gsd-index-calculator-dev-preprocess1k',
      InvocationType: 'Event',
      Payload: JSON.stringify(payload),
    })
  })

  const result = await Promise.all(promises)
  console.log('+++result', result)

  await slowDown(2000)

  // *******
  // TRACING
  stopLambdaTracing(lambdaTracingSubsegment)
  // *******

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  }
}
