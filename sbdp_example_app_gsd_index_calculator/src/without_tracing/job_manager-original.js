const AWS = require('aws-sdk')
const { promisify } = require('util')

const lambda = new AWS.Lambda()

const invokeLambda = promisify(lambda.invoke).bind(lambda)

/*
  https://aws.amazon.com/de/blogs/architecture/understanding-the-different-ways-to-invoke-lambda-functions/

  Manager needs to schedule the jobs based on data in S3:

  Asynchronous invocation to trigger multiple lambdas with further preprocessing and calculation
*/

// TODO: ONLY HELPER FUNCTION
const serialize = (object) => JSON.stringify(object, null, 2)

/*
  entry point of SBDP app with definition of
  1. which files should be processed by the preprocessed lambdas
  2. start job entry point
*/
module.exports.startJob = async (event, context) => {
  // *******
  // TRACING with Redis
  const eventBody = JSON.parse(event.body)
  const { jobId } = eventBody

  // *******

  console.log(`## ENVIRONMENT VARIABLES: ${serialize(process.env)}`)
  console.log(`## CONTEXT: ${serialize(context)}`)
  console.log(`## EVENT: ${serialize(event)}`)
  console.log(`## eventbody: ${event.body}`)

  const fileNames = [
    'test_with_description_title_change_500_single.json',
    'test_with_description_title_change_1000_single.json',
    'test_with_description_title_change_1500_single.json',
  ]

  const numberOfLambdaInvocations = Array.from(Array(5).keys())

  const promises = numberOfLambdaInvocations.map(() => {
    const payload = {
      fileNames,
      jobId,
    }
    return invokeLambda({
      FunctionName: 'gsd-index-calculator-dev-preprocess-without-tracing',
      InvocationType: 'Event',
      Payload: JSON.stringify(payload),
    })
  })

  const result = await Promise.all(promises)
  console.log('+++result', result)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  }
}
