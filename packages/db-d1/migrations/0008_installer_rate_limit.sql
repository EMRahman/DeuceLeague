-- One fixed row bounds installer traffic without retaining IP addresses.
CREATE TABLE installer_rate_limit (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  window INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 20)
) STRICT;
