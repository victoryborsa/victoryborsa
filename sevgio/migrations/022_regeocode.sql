-- Listings that were placed at the center of their town (because the address wasn't found) get looked up again.
UPDATE properties SET lat = NULL, lng = NULL, geocoded_at = NULL
 WHERE lat IS NOT NULL AND ((abs(lat - 40.4406) < 0.003 AND abs(lng + 79.9959) < 0.003) OR (abs(lat - 40.6215) < 0.003 AND abs(lng + 79.1525) < 0.003));
