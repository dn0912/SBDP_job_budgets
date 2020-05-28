const { BUCKET, FILE } = process.env

const AWS = require('aws-sdk')

const s3 = new AWS.S3()
const { promisify } = require('util')

const getS3Object = promisify(s3.getObject).bind(s3)


const readFile = async (bucketName, fileName) => {
  const params = {
    Bucket: bucketName,
    Key: fileName,
  }

  const data = await getS3Object(params)
  return data.Body.toString('utf-8')
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
    console.log('+++acc', acc)
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

  console.log('+++allCompletedTasks', allCompletedTasks)

  const overAllTimeDiff = allCompletedTasks.reduce((acc, taskId) => {
    const createdDate = createdAndCompletedTimeStampTasksMap[taskId][0]
    const completedDate = createdAndCompletedTimeStampTasksMap[taskId][1]
    const timeDiff = completedDate - createdDate
    return acc + timeDiff
  }, 0)

  return overAllTimeDiff / allCompletedTasks.length
}

module.exports.calculateGSDIndex = async (event, context) => {
  try {
    const s3FileContentAsString = await readFile(BUCKET, FILE)
    console.log('+++s3FileContent')

    const s3FileContent = JSON.parse(s3FileContentAsString)

    const averageTimeToCompleteTask = calculateAverageTimeToCompleteTask(s3FileContent)

    const response = {
      statusCode: 200,
      body: JSON.stringify({
        averageTimeToCompleteTask,
      })
    }
    return response
  } catch(err) {
    return {
      statusCode: err.statusCode || 400,
      body: err.message || JSON.stringify(err.message)
    }
  }
}
