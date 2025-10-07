import { useEffect, useState } from 'react'
import type { FeatureCollection, Geometry } from 'geojson'
import { fetchData } from '@/utils/fetchUtils'

export interface ProtoRegionProps {
  lang_code: string
  name: string
  variant?: string
  [key: string]: unknown
}

const useProtoRegionsGeoJSON = (path: string = '/proto_regions.geojson') => {
  const [data, setData] = useState<FeatureCollection<Geometry, ProtoRegionProps> | null>(null)

  useEffect(() => {
    fetchData<FeatureCollection<Geometry, ProtoRegionProps>>(path, json => {
      setData(json)
    })
  }, [path])

  return data
}

export default useProtoRegionsGeoJSON
