import SparkMD5 from 'spark-md5'
const worker = self as unknown as {
  onmessage: (event: MessageEvent<File>) => void
  postMessage: (value: unknown) => void
}
worker.onmessage = async (event) => {
  try {
    const file = event.data,
      spark = new SparkMD5.ArrayBuffer(),
      size = 2 * 1024 * 1024
    for (let offset = 0; offset < file.size; offset += size) {
      spark.append(await file.slice(offset, offset + size).arrayBuffer())
      worker.postMessage({ progress: Math.min(1, (offset + size) / file.size) })
    }
    worker.postMessage({ hash: spark.end() })
  } catch {
    worker.postMessage({ error: '文件读取失败，请重新选择' })
  }
}
