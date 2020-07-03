const AWSXRay = require('aws-xray-sdk-core')
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
const lambda = new AWS.Lambda()

const { promisify } = require('util')

const invokeLambda = promisify(lambda.invoke).bind(lambda)

/*
  https://aws.amazon.com/de/blogs/architecture/understanding-the-different-ways-to-invoke-lambda-functions/

  Manager needs to schedule the jobs based on data in S3:

  Asynchronous invokation to trigger multiple lambdas with further preprocessing and calculation
*/

// TODO: ONLY HELPER FUNCTION
const serialize = (object) => JSON.stringify(object, null, 2)

// TODO: remove later
// simulate slow function
const slowDown = async (ms) => {
  console.log('+++Take it easy!?!')
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
  // const segment = AWSXRay.getSegment()
  // console.log('+++segment', segment)
  // const subsegment = segment.addNewSubsegment('start jobmanager')
  // subsegment.addMetadata('hello', 'world', 'my namespace')
  // console.log('+++subsegment', subsegment)
  const segment = AWSXRay.getSegment()
  const eventBody = JSON.parse(event.body)
  const jobId = eventBody.jobId || 'dummyId'
  console.log('+++jobId', jobId)
  console.log('+++segment', segment)
  const subsegment = segment.addNewSubsegment('job manager subsegment')
  subsegment.addAnnotation('jobId', jobId)
  subsegment.addAnnotation('serviceType', 'AWSLambda')
  console.log('+++subsegment', subsegment)
  // *******


  console.log('## ENVIRONMENT VARIABLES: ' + serialize(process.env))
  console.log('## CONTEXT: ' + serialize(context))
  console.log('## EVENT: ' + serialize(event))
  console.log('## eventbody: ' + event.body)

  // TODO: batch files based on batch size coming from request
  const inputArray = [
    // 'test_with_description_title_change_500_single.json',
    // 'test_with_description_title_change_1000_single.json',
    'test_with_description_title_change_1500_single.json',
    // 'test_with_description_title_change_2000_single.json', // TODO: throws some timeout errors
  ]

  const promises = inputArray.map(fileName => {
    const payload = {
      fileName
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
  subsegment.close()
  // *******

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  }
}
