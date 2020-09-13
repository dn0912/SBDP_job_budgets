import AWS from 'aws-sdk'

const credentials = new AWS.SharedIniFileCredentials({ profile: process.env.AWS_PROFILE })
AWS.config.credentials = credentials
AWS.config.update({
  region: process.env.AWS_RESOURCE_REGION,
})

const XRay = new AWS.XRay()

// const serialize = (object) => JSON.stringify(object, null, 2)

export default class Tracer {
  constructor() {
    this.xray = XRay
  }

  async getXRayTraces(traceIds) {
    console.log('+++xray', this.xray)
    const param = {
      TraceIds: traceIds,
    }
    const traceData = await this.xray.batchGetTraces(param).promise()

    return traceData
  }

  async getXRayTraceSummaries(startTime, endTime, jobId) {
    // console.log('+++getXRayTraceSum', { startTime, endTime, passedSec: endTime - startTime })
    const FilterExpression = jobId ? `annotation.jobId = "${jobId}"` : ''
    const param = {
      StartTime: startTime,
      EndTime: endTime,
      ...FilterExpression ? { FilterExpression } : {},
    }

    const traceData = await this.xray.getTraceSummaries(param).promise()
    return traceData
  }

  async getXRayServiceGraph(startTime, endTime) {
    console.log('+++getXRayServiceGraph', { startTime, endTime })
    const param = {
      StartTime: startTime,
      EndTime: endTime,
    }
    const traceData = await this.xray.getServiceGraph(param).promise()
    return traceData
  }

  async batchGetXrayTraces(traceIds) {
    const param = {
      TraceIds: traceIds
    }
    const traceData = await this.xray.batchGetTraces(param).promise()
    return traceData
  }

  /**
   *
   * @param {*} jobId               JobId which is passed to the big data job
   * @param {number} startTime      Timestamp - seconds since epoch e.g. 15953207272.81
   */
  async getFullTrace(jobId, startTime) {
    const endTime = Date.now() / 1000
    const traceSummary = await this.getXRayTraceSummaries(startTime, endTime, jobId)

    // console.log('+++traceSummary', traceSummary)
    // console.log('+++traceSummary', serialize(traceSummary))
    const jobTraceIds = traceSummary.TraceSummaries.map((trace) => trace.Id)
    const traceData = await this.batchGetXrayTraces(jobTraceIds)

    // console.log('+++traceData', traceData)
    // console.log('+++traceData', serialize(traceData))

    const allTraceSegments = traceData.Traces.reduce((acc, trace) => {
      // console.log('++trace.Segments', trace.Segments)
      const traceSegments = trace.Segments
      acc.push(...traceSegments)
      return acc
    }, [])

    // console.log('+++allTraceSegments', allTraceSegments)

    return allTraceSegments
  }
}
