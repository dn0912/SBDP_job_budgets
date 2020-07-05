const { BUCKET, SUBRESULT_FOLDER, PIPELINE_RESULT_FOLDER } = process.env

const AWS = require('aws-sdk')
const moment = require('moment')
const s3 = new AWS.S3()

const { promisify } = require('util')

const getS3Object = promisify(s3.getObject).bind(s3)
const putS3Object = promisify(s3.putObject).bind(s3)

// TODO: remove later
// simulate slow function
const slowDown = async (ms) => {
  console.log('+++Take it easy!?!')
  await new Promise(resolve => setTimeout(resolve, ms))
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
  await putS3Object({
    Bucket: BUCKET,
    Key: `${PIPELINE_RESULT_FOLDER}/${fileName}`,
    Body: JSON.stringify(fileContent),
  })

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
  const createdAndCompletedTimeStampTasksMap = tasksUpdateArray.reduce((acc, taskUpdate, index) => {
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
    } else if (
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
  console.log('+++event', event)
  console.log('+++context', context)

  const fileName = event.Records[0].body

  const s3FileContentAsString = await readFile(fileName)
  const s3FileContent = JSON.parse(s3FileContentAsString)

  const averageTimeToCompleteTask = calculateAverageTimeToCompleteTask(s3FileContent)

  const resultFileName = await putFile({
    preprocessedDataFileName: fileName,
    averageTimeToCompleteTask,
  })

  await slowDown(3000)

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: "SQS event processed.",
      input: event,
      averageTimeToCompleteTask,
      resultFileName,
    }),
  }

  console.log('+++response', response)
  return response
}
