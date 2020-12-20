const TracedAWS = require('budget_control_system-trace_library')

const lambda = new TracedAWS.Lambda()

const { promisify } = require('util')

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
  // TRACING
  const eventBody = JSON.parse(event.body)
  const { jobId } = eventBody
  const lambdaSubsegment = TracedAWS.startLambdaTracer(context, jobId)

  console.log(`## ENVIRONMENT VARIABLES: ${serialize(process.env)}`)
  console.log(`## CONTEXT: ${serialize(context)}`)
  console.log(`## EVENT: ${serialize(event)}`)
  console.log(`## eventbody: ${event.body}`)

  const inputArray = [
    // 'test_with_description_title_change_500_single.json',
    'test_with_description_title_change_1000_single.json',
    // 'test_with_description_title_change_1500_single.json',
  ]

  const promises = inputArray.map((fileName) => {
    const payload = {
      fileName,
      jobId,
    }
    return invokeLambda({
      FunctionName: 'gsd-index-calculator-dev-preprocess-with-xray',
      InvocationType: 'Event',
      Payload: JSON.stringify(payload),
    })
  })

  const result = await Promise.all(promises)
  console.log('+++result', result)

  // TRACING
  TracedAWS.stopLambdaTracer(lambdaSubsegment)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  }
}
