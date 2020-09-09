const { BUCKET, SUBRESULT_FOLDER, PIPELINE_RESULT_FOLDER } = process.env

const TracedAWS = require('service-cost-tracer')

const moment = require('moment')
const { promisify } = require('util')

const s3 = new TracedAWS.S3()

const getS3Object = promisify(s3.getObject).bind(s3)
const tracedPutObject = promisify(s3.tracedPutObject).bind(s3)

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

const putFile = async (fileContent, jobId) => {
  const currentmTimeStamp = moment().valueOf()
  const fileName = `${currentmTimeStamp}_gsd_calculated.json`
  const params = {
    Bucket: BUCKET,
    Key: `${PIPELINE_RESULT_FOLDER}/${fileName}`,
    Body: JSON.stringify(fileContent),
  }
  await tracedPutObject(params, jobId)

  return fileName
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
  console.log('+++event2', JSON.stringify(event, undefined, 2))
  console.log('+++context', context)

  const eventBody = JSON.parse(event.Records[0].body)
  const { fileName } = eventBody

  // *******
  // Tracing
  const { jobId } = eventBody
  const lambdaSubsegment = TracedAWS.startLambdaTracer(context, jobId)
  // *******

  const s3FileContentAsString = await readFile(fileName)
  const s3FileContent = JSON.parse(s3FileContentAsString)

  const averageTimeToCompleteTask = calculateAverageTimeToCompleteTask(s3FileContent)

  const fileContent = {
    preprocessedDataFileName: fileName,
    averageTimeToCompleteTask,
  }
  // s3FileSizeTracer(jobId, fileContent)
  const resultFileName = await putFile(fileContent, jobId)

  await slowDown((Math.floor(Math.random() * (40 - 20 + 1) + 20)) * 100)

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

  // TRACING
  TracedAWS.stopLambdaTracer(lambdaSubsegment)

  return response
}
