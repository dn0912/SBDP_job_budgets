const AWS = require('aws-sdk')
const lambda = new AWS.Lambda()

const { promisify } = require('util')

const invokeLambda = promisify(lambda.invoke).bind(lambda)

/*
  https://aws.amazon.com/de/blogs/architecture/understanding-the-different-ways-to-invoke-lambda-functions/

  Manager needs to schedule the jobs based on data in S3:

  Asynchronous invokation to trigger multiple lambdas with further preprocessing and calculation
*/


/*
  entry point of SBDP app with definition of
  1. batch size
  2. start/stop job entry point
*/
module.exports.startJob = async (event, context) => {
  const inputArray = [
    'test_with_description_title_change_500_single.json',
    'test_with_description_title_change_1000_single.json',
    'test_with_description_title_change_1500_single.json',
    'test_with_description_title_change_2000_single.json',
  ]

  const preprocessorLambdaParams = (payload = {}) => ({
    FunctionName: 'lambda-gsd-index-calculator-dev-preprocess1k',
    InvocationType: 'Event',
    Payload: JSON.stringify(payload),
  })

  // trigger 4 lambdas for gsd calculation
  const result = await Promise.all(inputArray.map(async (fileName) => {
    const data = await invokeLambda(preprocessorLambdaParams({
      fileName,
    }))
    console.log('+++data.Payload', data.Payload)
    return data.Payload
  }))

  console.log('+++result', result)

  return {
    statusCode: 200,
    body: JSON.stringify(result),
  }
}
