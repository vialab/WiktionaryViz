import { useEffect, useState } from 'react'
import type { FeatureCollection, Geometry } from 'geojson'
import { fetchData } from '@/utils/fetchUtils'

export interface LanguageFamilyProps {
  id: string
  name: string
  point_count: number
  label_lon?: number
  label_lat?: number
  color?: string
  [key: string]: unknown
}

const useLanguageFamiliesGeoJSON = (path: string = '/language_families.geojson') => {
  const [data, setData] = useState<FeatureCollection<Geometry, LanguageFamilyProps> | null>(null)

  useEffect(() => {
    fetchData<FeatureCollection<Geometry, LanguageFamilyProps>>(path, json => {
      setData(json)
    })
  }, [path])

  return data
}

export default useLanguageFamiliesGeoJSON
