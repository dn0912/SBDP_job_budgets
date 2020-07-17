import AWS from 'aws-sdk'

const credentials = new AWS.SharedIniFileCredentials({ profile: process.env.AWS_PROFILE })
AWS.config.credentials = credentials
AWS.config.update({
  region: process.env.AWS_RESOURCE_REGION,
})

const XRay = new AWS.XRay()

export default class Tracer {
  constructor() {
    this.xray = XRay
  }

  // startTracing() {}

  async getXRayTraces(traceIds) {
    console.log('+++xray', this.xray)
    const param = {
      TraceIds: traceIds,
    }
    const traceData = await this.xray.batchGetTraces(param).promise()

    return traceData
  }

  async getXRayTraceSummaries(startTime, endTime, jobId) {
    console.log('+++getXRayTraceSummaries', { startTime, endTime })
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
}
