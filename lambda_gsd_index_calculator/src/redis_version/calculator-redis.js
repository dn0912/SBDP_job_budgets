const {
  BUCKET, SUBRESULT_FOLDER, PIPELINE_RESULT_FOLDER, REGION, QUEUE_NAME,
} = process.env

const AWS = require('aws-sdk')

const AWSTracerWithRedis = require('service-cost-tracer-with-redis')

const awsTracerWithRedis = new AWSTracerWithRedis(process)

const moment = require('moment')
const { promisify } = require('util')

const s3 = new AWS.S3()
const sqs = new AWS.SQS({
  region: REGION,
})

const getS3Object = awsTracerWithRedis.traceS3GetObject(
  promisify(s3.getObject).bind(s3),
)
const putS3Object = awsTracerWithRedis.traceS3PutObject(
  promisify(s3.putObject).bind(s3),
)

const deleteMessage = awsTracerWithRedis.traceSQSDeleteMessage(
  promisify(sqs.deleteMessage).bind(sqs),
)

// TODO: remove later
// simulate slow function
const slowDown = async (ms) => {
  console.log(`+++Take it easy!?! ${ms} ms`)
  await new Promise((resolve) => setTimeout(resolve, ms))
}

const readFile = async (fileName) => {
  const params = {
    Bucket: BUCKET,
    Key: `${SUBRESULT_FOLDER}/${fileName}`,
  }

  const data = await getS3Object(params)

  return data.Body.toString('utf-8')
}

const putFile = async (fileContent) => {
  const currentmTimeStamp = moment().valueOf()
  const fileName = `${currentmTimeStamp}_gsd_calculated.json`
  const params = {
    Bucket: BUCKET,
    Key: `${PIPELINE_RESULT_FOLDER}/${fileName}`,
    Body: JSON.stringify(fileContent),
  }
  await putS3Object(params)

  return fileName
}

const deleteSqsMessage = async (receiptHandle, context) => {
  const accountId = context.invokedFunctionArn.split(':')[4]
  const queueUrl = `https://sqs.${REGION}.amazonaws.com/${accountId}/${QUEUE_NAME}`
  const params = {
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  }

  console.log('+++deleteSqsMessage', params)
  await deleteMessage(params)
}

const calculateAverageTimeToCompleteTask = (tasksUpdateArray) => {
  // console.log('+++tasksUpdateArray', tasksUpdateArray)
  /*
    {
      'T1': [startDate, endDate],
      'T2': [startDate, endDate],
    }
  */
  const createdAndCompletedTimeStampTasksMap = tasksUpdateArray.reduce((acc, taskUpdate) => {
    const currentTaskId = taskUpdate['Keys']['taskId']
    // is task new created is created but not in completed column?
    if (
      !taskUpdate['OldImage']['statusId']
      && taskUpdate['NewImage']['statusId'] !== 'completed'
    ) {
      const taskCreationDate = taskUpdate['NewImage']['createDate']
      return {
        ...acc,
        [currentTaskId]: [taskCreationDate],
      }
    }

    if (
      taskUpdate['OldImage']['statusId'] !== undefined
      && taskUpdate['NewImage']['statusId'] === 'completed'
    ) {
      const taskCompletedDate = taskUpdate['NewImage']['updateDate']
      const taskCreatedDate = acc[currentTaskId][0]
      return {
        ...acc,
        [currentTaskId]: [taskCreatedDate, taskCompletedDate],
      }
    }
    return acc
  }, {})

  const allCompletedTasks = Object.keys(createdAndCompletedTimeStampTasksMap)

  const overAllTimeDiff = allCompletedTasks.reduce((acc, taskId) => {
    const createdDate = createdAndCompletedTimeStampTasksMap[taskId][0]
    const completedDate = createdAndCompletedTimeStampTasksMap[taskId][1]
    const timeDiff = completedDate - createdDate
    return acc + timeDiff
  }, 0)

  return overAllTimeDiff / allCompletedTasks.length
}

module.exports.handler = async (event, context) => {
  try {
    console.log('+++event2', JSON.stringify(event, undefined, 2))
    console.log('+++context', context)

    const { body, receiptHandle } = event.Records[0]
    const eventBody = JSON.parse(body)
    const { fileName } = eventBody

    // *******
    // Tracing with Redis
    await awsTracerWithRedis.startLambdaTracer(event, context)
    // *******

    await deleteSqsMessage(receiptHandle, context)

    const s3FileContentAsString = await readFile(fileName)
    const s3FileContent = JSON.parse(s3FileContentAsString)

    console.log('+++before calculation')

    const averageTimeToCompleteTask = calculateAverageTimeToCompleteTask(s3FileContent)

    console.log('+++after calculation')

    // await slowDown(2000)

    const fileContent = {
      preprocessedDataFileName: fileName,
      averageTimeToCompleteTask,
    }

    const resultFileName = await putFile(fileContent)

    // await slowDown((Math.floor(Math.random() * (40 - 20 + 1) + 20)) * 100)

    const response = {
      statusCode: 200,
      body: JSON.stringify({
        message: 'SQS event processed.',
        input: event,
        averageTimeToCompleteTask,
        resultFileName,
      }),
    }

    // await slowDown(2000)

    console.log('+++response', response)

    // TRACING with redis
    await awsTracerWithRedis.stopLambdaTracer()

    return response
  } catch (err) {
    console.log('+++err', err)
  }
}
