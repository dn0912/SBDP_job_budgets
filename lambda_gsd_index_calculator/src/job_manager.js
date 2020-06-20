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

/*
  entry point of SBDP app with definition of
  1. batch size
  2. start/stop job entry point
*/
module.exports.startJob = async (event, context) => {

  console.log('## ENVIRONMENT VARIABLES: ' + serialize(process.env))
  console.log('## CONTEXT: ' + serialize(context))
  console.log('## EVENT: ' + serialize(event))

  const inputArray = [
    'test_with_description_title_change_500_single.json',
    'test_with_description_title_change_1000_single.json',
    'test_with_description_title_change_1500_single.json',
    'test_with_description_title_change_2000_single.json',
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

  const test = await Promise.all(promises)
  console.log('+++test', test)
}
