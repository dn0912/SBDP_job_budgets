const {
  BUCKET, SUBRESULT_FOLDER, PIPELINE_RESULT_FOLDER, REGION, QUEUE_NAME,
} = process.env

const AWS = require('aws-sdk')

const moment = require('moment')
const { promisify } = require('util')

const s3 = new AWS.S3()
const sqs = new AWS.SQS({
  region: REGION,
})

const getS3Object = promisify(s3.getObject).bind(s3)
const putS3Object = promisify(s3.putObject).bind(s3)

const deleteMessage = promisify(sqs.deleteMessage).bind(sqs)

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

    await deleteSqsMessage(receiptHandle, context)

    const s3FileContentAsString = await readFile(fileName)
    const s3FileContent = JSON.parse(s3FileContentAsString)

    console.log('+++before calculation')

    const averageTimeToCompleteTask = calculateAverageTimeToCompleteTask(s3FileContent)

    console.log('+++after calculation')

    const fileContent = {
      preprocessedDataFileName: fileName,
      averageTimeToCompleteTask,
    }

    const resultFileName = await putFile(fileContent)

    const response = {
      statusCode: 200,
      body: JSON.stringify({
        message: 'SQS event processed.',
        input: event,
        averageTimeToCompleteTask,
        resultFileName,
      }),
    }

    console.log('+++response', response)

    return response
  } catch (err) {
    console.log('+++err', err)
  }
}
