import { describe, expect, it } from 'vitest'
import { groupListingsByVillage } from './mapClusters'

describe('groupListingsByVillage', () => {
  it('groups mapped listings and averages their coordinates', () => {
    const clusters = groupListingsByVillage([
      { latitude: 13.5, longitude: 144.8, village: { slug: 'dededo', name: 'Dededo' } },
      { latitude: 13.6, longitude: 144.9, village: { slug: 'dededo', name: 'Dededo' } },
      { latitude: 13.48, longitude: 144.78, village: { slug: 'tamuning', name: 'Tamuning' } },
      { village: { slug: 'unmapped', name: 'Unmapped' } },
    ])

    expect(clusters.map(({ village, count }) => ({ village, count }))).toEqual([
      { village: 'Dededo', count: 2 },
      { village: 'Tamuning', count: 1 },
    ])
    expect(clusters[0].latitude).toBeCloseTo(13.55)
    expect(clusters[0].longitude).toBeCloseTo(144.85)
  })

  it('keeps valid zero coordinates', () => {
    expect(groupListingsByVillage([
      { latitude: 0, longitude: 0, village: { slug: 'origin', name: 'Origin' } },
    ])).toEqual([
      { village: 'Origin', count: 1, latitude: 0, longitude: 0 },
    ])
  })
})
