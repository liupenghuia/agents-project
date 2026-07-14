const DEFAULT_BOUNDS_DELTA = 0.25;

function boundsFromCenter(latitude, longitude, delta = DEFAULT_BOUNDS_DELTA) {
  return {
    south: Math.max(-90, latitude - delta),
    west: Math.max(-180, longitude - delta),
    north: Math.min(90, latitude + delta),
    east: Math.min(180, longitude + delta),
  };
}

function buildMapQuery(bounds, zoom, keyword, role) {
  const query = { ...bounds, zoom: Math.max(3, Math.min(20, Math.round(zoom || 11))), limit: 50 };
  const value = String(keyword || '').trim();
  if (value) query[role === 'applicant' ? 'jobType' : 'jobTypeName'] = value;
  return query;
}

function markerTitle(item, role) {
  if (item.cluster) return `${item.count} 条信息`;
  return role === 'applicant' ? item.jobType : item.jobTypeName;
}

function toMapMarkers(items, role) {
  const targets = {};
  const markers = (items || []).map((item, index) => {
    const markerId = index + 1;
    targets[markerId] = item;
    return {
      id: markerId,
      latitude: item.latitude,
      longitude: item.longitude,
      width: item.cluster ? 38 : 28,
      height: item.cluster ? 38 : 28,
      callout: {
        content: markerTitle(item, role),
        display: 'ALWAYS',
        color: item.cluster ? '#ffffff' : '#17332d',
        bgColor: item.cluster ? '#0d7c66' : '#ffffff',
        borderColor: '#0d7c66',
        borderWidth: 1,
        borderRadius: 4,
        padding: 7,
        fontSize: item.cluster ? 14 : 12,
        textAlign: 'center',
      },
    };
  });
  return { markers, targets };
}

module.exports = { boundsFromCenter, buildMapQuery, toMapMarkers };
