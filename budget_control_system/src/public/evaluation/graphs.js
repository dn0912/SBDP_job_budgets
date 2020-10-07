// Plotly.d3.csv("https://raw.githubusercontent.com/plotly/datasets/master/violin_data.csv", function (err, rows) {

const unpack = (rows, key) => {
  // console.log('rows', rows)
  return rows.map((row) => parseInt(row[key].trim(), 10))
}

/**
 * TODO: Fetching trace data delay
 */
// eslint-disable-next-line no-undef
Plotly.d3.csv('http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-local.csv', (err, localRows) => {
  // eslint-disable-next-line no-undef
  Plotly.d3.csv('http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-deployed_trace_backend.csv', (err, deployedRows) => {
    // eslint-disable-next-line no-undef
    Plotly.d3.csv('http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysXRay.csv', (err, xrayRows) => {
      const localRowsWithType = localRows.map((val) => ({
        ...val,
        traceFetchDelayInMS: val.passedTime,
        traceType: 'Redis-based - local',
      }))

      const deployedRowsWithType = deployedRows.map((val) => ({
        ...val,
        traceFetchDelayInMS: val.passedTime,
        traceType: 'Redis-based - Deployed',
      }))

      const xrayRowsWithType = xrayRows.map((val) => ({
        ...val,
        traceFetchDelayInMS: val.elapsedTimeFromClosingTraceToNow,
        traceType: 'XRay-based',
      }))

      const allRows = [...xrayRowsWithType, ...localRowsWithType, ...deployedRowsWithType]

      const data = [{
        type: 'violin',
        x: allRows.map((val) => val.traceType),
        y: unpack(allRows, 'traceFetchDelayInMS'),
        points: 'none',
        box: {
          visible: true
        },
        line: {
          color: 'green',
        },
        meanline: {
          visible: true
        },
        transforms: [{
          type: 'groupby',
          groups: allRows.map((val) => val.traceType),
          styles: [
            { target: 'Redis-based - local', value: { line: { color: 'blue' } } },
            { target: 'Redis-based - Deployed', value: { line: { color: 'orange' } } },
            { target: 'XRay-based', value: { line: { color: 'green' } } },
          ]
        }]
      }]

      const layout = {
        title: '',
        yaxis: {
          zeroline: false,
          title: 'time in ms',
          range: [-450, 7700],
        },
        width: 550,
        height: 550,
        // showlegend: false,
      }

      // eslint-disable-next-line no-undef
      Plotly.newPlot('violin-graph-all', data, layout)
    })
  })
})

// eslint-disable-next-line no-undef
Plotly.d3.csv('http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-local.csv', (err, rows) => {
  const unpackedData = unpack(rows, 'passedTime')

  const data = [{
    type: 'violin',
    y: unpackedData,
    points: 'none',
    box: {
      visible: true
    },
    boxpoints: false,
    line: {
      color: 'black'
    },
    fillcolor: '#8dd3c7',
    opacity: 0.6,
    meanline: {
      visible: true
    },
    x0: 'Local trace-backend'
  }]

  const layout = {
    title: 'Delay of fetching data with local trace-backend',
    yaxis: {
      zeroline: false,
      title: 'time difference in ms',
    },
    autosize: false,
    width: 550,
    height: 550,
    margin: {
      l: 50,
      r: 50,
      b: 100,
      t: 100,
      pad: 4
    },
    // paper_bgcolor: '#7f7f7f',
    // plot_bgcolor: '#c7c7c7'
  }

  // eslint-disable-next-line no-undef
  Plotly.newPlot('violin-graph', data, layout)
})

// eslint-disable-next-line no-undef
Plotly.d3.csv(
  'http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-deployed_trace_backend.csv',
  (err, rows) => {
    const unpackedData = unpack(rows, 'passedTime')

    const data2 = [{
      type: 'violin',
      y: unpackedData,
      points: 'none',
      box: {
        visible: true
      },
      boxpoints: false,
      line: {
        color: 'black'
      },
      fillcolor: '#8dd3c7',
      opacity: 0.6,
      meanline: {
        visible: true
      },
      x0: 'Deployed trace-backend'
    }]

    const layout2 = {
      title: 'Delay of fetching data with deployed trace-backend',
      yaxis: {
        zeroline: false,
        title: 'time difference in ms',
      },
      autosize: false,
      width: 550,
      height: 550,
      margin: {
        l: 50,
        r: 50,
        b: 100,
        t: 100,
        pad: 4
      },
      // paper_bgcolor: '#7f7f7f',
      // plot_bgcolor: '#c7c7c7'
    }

    // eslint-disable-next-line no-undef
    Plotly.newPlot('violin-graph2', data2, layout2)
  }
)

// eslint-disable-next-line no-undef
Plotly.d3.csv('http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-local.csv', (err, localDataRows) => {
  // eslint-disable-next-line no-undef
  Plotly.d3.csv('http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-deployed_trace_backend.csv', (err, deployedTraceBackendRows) => {
    const unpackedLocalData = unpack(localDataRows, 'passedTime')
    const unpackedDeployedTraceBackendData = unpack(deployedTraceBackendRows, 'passedTime')

    // const xValues = localDataRows.map(() => 'Delay (ms)')

    const _unpack = (rows, key) => {
      console.log('rows', rows)
      return rows.map((row) => `${row[key].trim()} lambdas`)
    }

    const data = [{
      type: 'violin',
      x: _unpack(deployedTraceBackendRows, 'parallelLambdas'),
      y: unpackedLocalData,
      legendgroup: 'local BE',
      scalegroup: 'local BE',
      name: 'local BE',
      side: 'negative',
      box: {
        visible: true
      },
      line: {
        color: 'blue',
        width: 2
      },
      meanline: {
        visible: true
      }
    },
    {
      type: 'violin',
      x: _unpack(localDataRows, 'parallelLambdas'),
      y: unpackedDeployedTraceBackendData,
      legendgroup: 'deployed BE',
      scalegroup: 'deployed BE',
      name: 'deployed BE',
      side: 'positive',
      box: {
        visible: true
      },
      line: {
        color: 'green',
        width: 2
      },
      meanline: {
        visible: true
      }
    }]

    const layout = {
      title: 'Split local and deployed trace-backend',
      yaxis: {
        zeroline: false,
        title: 'time in ms',
      },
      violingap: 0,
      violingroupgap: 0,
      violinmode: 'overlay',
      width: 1000,
      height: 550,
    }

    // eslint-disable-next-line no-undef
    Plotly.newPlot('myDiv3', data, layout)
  })
})

/**
 * TODO: lambda processing time accuracy
 */
// eslint-disable-next-line no-undef
Plotly.d3.csv(
  'http://localhost:8080/evaluation/lambda-processing-time-accuracy/parrallel_lambdas-lambdaProcessingTimeAccuracy_cw.csv',
  (err, cwRows) => {
    // eslint-disable-next-line no-undef
    Plotly.d3.csv(
      'http://localhost:8080/evaluation/lambda-processing-time-accuracy/parrallel_lambdas-lambdaProcessingTimeAccuracy_tracer.csv',
      (err, tracerRows) => {
        console.log('+++cwRows', cwRows)
        console.log('+++tracerRows', tracerRows)
        const cloudWatchMap = cwRows.reduce((acc, value) => {
          return {
            ...acc,
            [value.RequestID]: value,
          }
        }, {})

        const tracerMap = tracerRows.reduce((acc, value) => {
          return {
            ...acc,
            [value.RequestID]: value,
          }
        }, {})

        const deltas = tracerRows.map((lambdaTrace) => {
          const { requestId } = lambdaTrace

          const lambdaDurationInMSSec = parseInt(lambdaTrace.processingTime * 1000, 10)
          const billedDuration = Math.ceil(lambdaDurationInMSSec / 100) * 100

          const cwLambdaBilledDurationIn100Ms = parseInt(cloudWatchMap[requestId].BilledDurationInMS, 10)
          const cwLambdaDurationInMs = parseInt(cloudWatchMap[requestId].DurationInMS, 10)

          return {
            requestId,
            budgetTool_tracedlambdaDurationInMSSec: lambdaDurationInMSSec,
            budgetTool_billedDuration: billedDuration,
            cw_LambdaDurationInMs: cwLambdaDurationInMs,
            cw_LambdaBilledDurationIn100Ms: cwLambdaBilledDurationIn100Ms,
            deltaBilledDuration: cwLambdaBilledDurationIn100Ms - billedDuration,
            deltaDuration: cwLambdaDurationInMs - lambdaDurationInMSSec,
          }
        })

        const overshootSum = deltas.reduce((sum, val) => {
          if (val.deltaBilledDuration) {
            return sum += 1
          }
          return sum
        }, 0)
        console.log('+++deltas', deltas, overshootSum)
        const traceDeltaIn100MsSegments = {
          x: deltas.map((val, index) => index),
          y: deltas.map((val) => val.deltaBilledDuration),
          name: 'Billed difference',
        }
        const traceDeltaInMs = {
          x: deltas.map((val, index) => index),
          y: deltas.map((val) => val.deltaDuration),
          name: 'Measured difference',
          type: 'bar'
        }

        const getStandardDeviation = (array) => {
          const n = array.length
          const mean = array.reduce((a, b) => a + b) / n
          console.log('+++mean', mean)
          return Math.sqrt(array.map((x) => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n)
        }

        const traceDeltaInMsArray = deltas.map((val) => val.deltaDuration)
        console.log('+++getStandardDeviation', traceDeltaInMsArray, getStandardDeviation(traceDeltaInMsArray))

        // eslint-disable-next-line no-undef
        Plotly.newPlot(
          'diff-measurement-detailed',
          [traceDeltaInMs],
          {
            title: 'Time difference of lambda execution duration <br>between CloudWatch logs and trace-backend',
            width: 1000,
            height: 550,
            xaxis: { title: 'execution index' },
            yaxis: { title: 'time difference in CloudWatch log in ms' },
          },
          { editable: true },
        )

        // eslint-disable-next-line no-undef
        Plotly.newPlot(
          'diff-measurement-billed',
          [traceDeltaIn100MsSegments],
          {
            title: 'Billed time difference of lambda execution duration <br>between CloudWatch logs and trace-backend',
            width: 1000,
            height: 550,
            xaxis: { title: 'execution index' },
            yaxis: { title: 'time difference in ms' },
          },
          { editable: true },
        )

        const mergedCWAndTracerData = tracerRows.map((tracerVal) => {
          return {
            cwDuration: cloudWatchMap[tracerVal.requestId].DurationInMS,
            tracerDuration: tracerVal.processingTime * 1000,
          }
        })

        const cWDuration = {
          x: cwRows.map((val, index) => index),
          y: cwRows.map((val) => val.DurationInMS),
        }

        const traceTracerDuration = {
          x: tracerRows.map((val, index) => index),
          y: tracerRows.map((val) => val.processingTime * 1000),
        }

        const data2 = [cWDuration, traceTracerDuration]
        const data3 = [
          {
            x: mergedCWAndTracerData.map((val, index) => index),
            y: mergedCWAndTracerData.map((val) => val.cwDuration / 1000),
            name: 'CloudWatch measured lambda duration',
          },
          {
            x: mergedCWAndTracerData.map((val, index) => index),
            y: mergedCWAndTracerData.map((val) => val.tracerDuration / 1000),
            name: 'Traced lambda duration',
          },
        ]
        // eslint-disable-next-line no-undef
        Plotly.newPlot('myDiv5', data3, {
          width: 1000,
          height: 550,
          yaxis: {
            title: 'time in s',
          },
          xaxis: {
            title: 'lambda execution index',
          },
        })

        const dataExecutionProfile = [{
          x: mergedCWAndTracerData.map((val, index) => index),
          y: mergedCWAndTracerData.map((val) => val.cwDuration / 1000),
          name: 'CloudWatch measured lambda duration',
        }]
        // eslint-disable-next-line no-undef
        Plotly.newPlot('execution-profile', dataExecutionProfile, {
          title: 'SBDP job execution profiles',
          width: 1000,
          height: 550,
          yaxis: {
            title: 'time in s',
          },
          xaxis: {
            title: 'lambda execution index',
          },
        })

        // const data4 = [{
        //   opacity: 0.5,
        //   type: 'histogram',
        //   x: mergedCWAndTracerData.map((val, index) => index),
        //   y: mergedCWAndTracerData.map((val) => val.cwDuration),
        //   name: 'CloudWatch measured lambda duration',
        //   marker: {
        //     color: 'green',
        //   },
        // },
        // {
        //   opacity: 0.5,
        //   type: 'histogram',
        //   x: mergedCWAndTracerData.map((val, index) => index),
        //   y: mergedCWAndTracerData.map((val) => val.tracerDuration),
        //   name: 'Traced lambda duration',
        //   marker: {
        //     color: 'red',
        //   },
        // }]
        // const layout = {
        //   bargap: 0.05,
        //   bargroupgap: 0.2,
        //   barmode: 'overlay',
        //   // title: 'Sampled Results',
        //   // xaxis: { title: 'Value' },
        //   // yaxis: { title: 'Count' }
        //   width: 1000,
        //   height: 550,
        // }
        // // eslint-disable-next-line no-undef
        // Plotly.newPlot('myDiv6', data4, layout)
      }
    )
  }
)

const reduceHelperFunc = (acc, nonParsedVal) => {
  const val = {
    ...nonParsedVal,
    DurationInMS: Number(nonParsedVal.DurationInMS),
    BilledDurationInMS: Number(nonParsedVal.BilledDurationInMS),
    MemorySetInMB: Number(nonParsedVal.MemorySetInMB),
    MemoryUsedInMB: Number(nonParsedVal.MemorySetInMB),
  }
  // dataset contains 500,1000,1500,2000
  if (val.setType === 'large') {
    if (val.FunctionArn.includes('calculate')) {
      acc.large.calculateLambda.push(val)
    } else if (val.FunctionArn.includes('preprocess')) {
      acc.large.preprocessLambda.push(val)
    } else {
      acc.large.startJobLambda.push(val)
    }
  } else if (val.setType === 'small') { // dataset contains 500,1000,1500
    if (val.FunctionArn.includes('calculate')) {
      acc.small.calculateLambda.push(val)
    } else if (val.FunctionArn.includes('preprocess')) {
      acc.small.preprocessLambda.push(val)
    } else {
      acc.small.startJobLambda.push(val)
    }
  }

  return acc
}

/**
 * TODO: Instrumentation impact
 */
// eslint-disable-next-line no-undef
Plotly.d3.csv(
  'http://localhost:8080/evaluation/impact-instrumentation/impact_instrumentation-not_instrumented.csv',
  (err, originalRows) => {
    // eslint-disable-next-line no-undef
    Plotly.d3.csv(
      'http://localhost:8080/evaluation/impact-instrumentation/impact_instrumentation-traced.csv',
      (err, tracedRows) => {
        console.log('+++originalRows', originalRows)
        console.log('+++tracedRows', tracedRows)

        const originalDataSet = originalRows.reduce((acc, nonParsedVal) => {
          const returnedAcc = reduceHelperFunc(acc, nonParsedVal)
          return returnedAcc
        },
        {
          small: {
            calculateLambda: [],
            preprocessLambda: [],
            startJobLambda: [],
          },
          large: {
            calculateLambda: [],
            preprocessLambda: [],
            startJobLambda: [],
          }
        })

        const tracedDataSet = tracedRows.reduce((acc, nonParsedVal) => {
          const returnedAcc = reduceHelperFunc(acc, nonParsedVal)
          return returnedAcc
        },
        {
          small: {
            calculateLambda: [],
            preprocessLambda: [],
            startJobLambda: [],
          },
          large: {
            calculateLambda: [],
            preprocessLambda: [],
            startJobLambda: [],
          }
        })

        console.log('+++originalDataSet', originalDataSet)
        const originaldataResult = {
          small: {
            calculateMean: _.meanBy(originalDataSet.small.calculateLambda, 'DurationInMS'),
            preprocessMean: _.meanBy(originalDataSet.small.preprocessLambda, 'DurationInMS'),
            startJobMean: _.meanBy(originalDataSet.small.startJobLambda, 'DurationInMS'),
          },
          large: {
            calculateMean: _.meanBy(originalDataSet.large.calculateLambda, 'DurationInMS'),
            preprocessMean: _.meanBy(originalDataSet.large.preprocessLambda, 'DurationInMS'),
            startJobMean: _.meanBy(originalDataSet.large.startJobLambda, 'DurationInMS'),
          }
        }

        const tracedDataSetResult = {
          small: {
            calculateMean: _.meanBy(tracedDataSet.small.calculateLambda, 'DurationInMS'),
            preprocessMean: _.meanBy(tracedDataSet.small.preprocessLambda, 'DurationInMS'),
            startJobMean: _.meanBy(tracedDataSet.small.startJobLambda, 'DurationInMS'),
          },
          large: {
            calculateMean: _.meanBy(tracedDataSet.large.calculateLambda, 'DurationInMS'),
            preprocessMean: _.meanBy(tracedDataSet.large.preprocessLambda, 'DurationInMS'),
            startJobMean: _.meanBy(tracedDataSet.large.startJobLambda, 'DurationInMS'),
          },
        }

        console.log('+++originaldataResult', originaldataResult)
        console.log('+++tracedDataSetResult', tracedDataSetResult)

        const xValues = ['job manager λ', 'preprocessor λ', 'calculator λ']
        const yValuesSmallDataSetOriginal = [
          Math.round(originaldataResult.small.startJobMean),
          Math.round(originaldataResult.small.preprocessMean),
          Math.round(originaldataResult.small.calculateMean),
        ]

        const yValuesSmallDataSetTraced = [
          Math.round(tracedDataSetResult.small.startJobMean),
          Math.round(tracedDataSetResult.small.preprocessMean),
          Math.round(tracedDataSetResult.small.calculateMean),
        ]

        console.log('+++yValuesSmallDataSetOriginal', yValuesSmallDataSetOriginal, yValuesSmallDataSetTraced)

        const chartSmallDataSetOriginal = {
          x: xValues,
          y: yValuesSmallDataSetOriginal,
          type: 'bar',
          text: yValuesSmallDataSetOriginal.map(String),
          textposition: 'auto',
          name: 'Non-instrumented λ',
        }

        const chartSmallDataSetTraced = {
          x: xValues,
          y: yValuesSmallDataSetTraced,
          type: 'bar',
          text: yValuesSmallDataSetTraced.map(String),
          textposition: 'auto',
          name: 'Traced λ',
        }

        // eslint-disable-next-line no-undef
        Plotly.newPlot(
          'instrumentation-impact-small-dataset',
          [
            chartSmallDataSetOriginal,
            chartSmallDataSetTraced,
          ],
          {
            title: 'Small data set: Mean run time of instrumented and non-instrumented λ',
            yaxis: { title: 'time in ms' },
          }
        )

        const yValuesLargeDataSetOriginal = [
          Math.round(originaldataResult.large.startJobMean),
          Math.round(originaldataResult.large.preprocessMean),
          Math.round(originaldataResult.large.calculateMean),
        ]

        const yValuesLargeDataSetTraced = [
          Math.round(tracedDataSetResult.large.startJobMean),
          Math.round(tracedDataSetResult.large.preprocessMean),
          Math.round(tracedDataSetResult.large.calculateMean),
        ]

        console.log('+++yValuesLargeDataSetOriginal', yValuesLargeDataSetOriginal, yValuesLargeDataSetTraced)

        const chartLargeDataSetOriginal = {
          x: xValues,
          y: yValuesLargeDataSetOriginal,
          type: 'bar',
          text: yValuesLargeDataSetOriginal.map(String),
          textposition: 'auto',
          name: 'Non-instrumented λ',
        }

        const chartLargeDataSetTraced = {
          x: xValues,
          y: yValuesLargeDataSetTraced,
          type: 'bar',
          text: yValuesLargeDataSetTraced.map(String),
          textposition: 'auto',
          name: 'Traced λ',
        }

        // eslint-disable-next-line no-undef
        Plotly.newPlot(
          'instrumentation-impact-large-dataset',
          [
            chartLargeDataSetOriginal,
            chartLargeDataSetTraced,
          ],
          {
            title: 'Large data set: Mean run time of instrumented and non-instrumented λ',
            yaxis: { title: 'time in ms' },
          }
        )
      }
    )
  }
)
