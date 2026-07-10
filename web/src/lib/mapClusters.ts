export type MapClusterPoint = {
  latitude?: number
  longitude?: number
  village: { slug: string; name: string }
}

export type VillageMapCluster = {
  village: string
  count: number
  latitude: number
  longitude: number
}

export function groupListingsByVillage(listings: MapClusterPoint[]) {
  const groups = new Map<string, VillageMapCluster>()

  for (const listing of listings) {
    if (!listing.latitude || !listing.longitude) continue

    const key = listing.village.slug || listing.village.name
    const group = groups.get(key) || { village: listing.village.name, count: 0, latitude: 0, longitude: 0 }
    group.count += 1
    group.latitude += listing.latitude
    group.longitude += listing.longitude
    groups.set(key, group)
  }

  return [...groups.values()]
}
