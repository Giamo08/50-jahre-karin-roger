export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)

  const maxSize = 1600
  const scale = Math.min(
    1,
    maxSize / Math.max(bitmap.width, bitmap.height),
  )

  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')

  if (!context) {
    bitmap.close()
    throw new Error('Bild konnte nicht verarbeitet werden.')
  }

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) {
          resolve(blob)
        } else {
          reject(
            new Error('Bild konnte nicht komprimiert werden.'),
          )
        }
      },
      'image/jpeg',
      0.82,
    )
  })
}