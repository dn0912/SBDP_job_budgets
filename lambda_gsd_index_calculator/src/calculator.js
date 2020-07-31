const { BUCKET, SUBRESULT_FOLDER, PIPELINE_RESULT_FOLDER } = process.env

const AWSXRay = require('aws-xray-sdk-core')
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
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

// *******
// TRACING
const s3FileSizeTracer = (jobId, fileContent) => {
  const contentByteSize = Buffer.byteLength(JSON.stringify(fileContent), 'utf8');
  const s3ContentKiloByteSize = contentByteSize / 1024

  console.log('+++jobId', jobId)
  console.log('+++s3ContentKiloByteSize', s3ContentKiloByteSize)

  const segment = AWSXRay.getSegment()
  const subsegment = segment.addNewSubsegment('Cost tracer subsegment - S3: S3 file size')
  subsegment.addAnnotation('s3ContentKiloByteSize', s3ContentKiloByteSize)
  subsegment.addAnnotation('jobId', jobId)
  subsegment.addAnnotation('serviceType', 'S3')
  subsegment.close()
}
// TRACING
// *******

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

const startLambdaTracing = (jobId = 'dummyId') => {
  console.log('+++Start tracing - preprocesser')
  const segment = AWSXRay.getSegment()
  console.log('+++jobId', jobId)
  console.log('+++segment', segment)
  const subsegment = segment.addNewSubsegment('Cost tracer subsegment - Lambda: calculator')
  subsegment.addAnnotation('jobId', jobId)
  subsegment.addAnnotation('serviceType', 'AWSLambda')
  console.log('+++subsegment', subsegment)

  return subsegment
}

const stopLambdaTracing = (lambdaSubsegment) => {
  lambdaSubsegment.addAnnotation('currentTimeStamp', moment.utc().valueOf())
  lambdaSubsegment.close()
}

module.exports.handler = async (event, context) => {
  console.log('+++event2', JSON.stringify(event, undefined, 2))
  console.log('+++context', context)

  const eventBody = JSON.parse(event.Records[0].body)
  const { fileName } = eventBody

  // *******
  // Tracing
  const { jobId } = eventBody
  const lambdaTracingSubsegment = startLambdaTracing(jobId)
    // *******

  const s3FileContentAsString = await readFile(fileName)
  const s3FileContent = JSON.parse(s3FileContentAsString)

  const averageTimeToCompleteTask = calculateAverageTimeToCompleteTask(s3FileContent)

  const fileContent = {
    preprocessedDataFileName: fileName,
    averageTimeToCompleteTask,
  }
  s3FileSizeTracer(jobId, fileContent)
  const resultFileName = await putFile(fileContent)

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

  // *******
  // TRACING
  stopLambdaTracing(lambdaTracingSubsegment)
    // *******

  return response
}
