```
        filter @type = "REPORT"
        
        | fields @log as FunctionArn, @timestamp as Timestamp, @requestId as RequestID, @logStream as LogStream, @duration as DurationInMS, @billedDuration as BilledDurationInMS, @memorySize/1000000 as MemorySetInMB, @maxMemoryUsed/1000000 as MemoryUsedInMB
        | sort Timestamp desc
        | head 9
    
```
