import { useState, useEffect } from 'react'
import { usePapaParse } from 'react-papaparse'
import { fetchData } from '@/utils/fetchUtils'
import type { LanguoidData } from '@/types/languoid'

const useLanguoidData = () => {
  const [languoidData, setLanguoidData] = useState<LanguoidData[]>([])
  const [loading, setLoading] = useState(true)
  const { readString } = usePapaParse()

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetchData<string>('/languoid.csv', csvText => {
      readString(csvText, {
        header: true,
        delimiter: ',',
        worker: true,
        complete: results => {
          if (!cancelled) {
            setLanguoidData(results.data as LanguoidData[])
            setLoading(false)
          }
        },
        error: error => console.error('Error parsing languoid CSV:', error),
      })
    })

    return () => {
      cancelled = true
    }
  }, [readString])

  console.log('Languoid data state:', languoidData)
  return { languoidData, loading }
}

export default useLanguoidData
