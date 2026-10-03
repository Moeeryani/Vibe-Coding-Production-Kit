# Orders API Product Requirement

Authority: ACCEPTED

Marker: ORDERS-LOCAL-AUTHORITY

The orders package exposes `formatOrderId(rawId)`.

Requirements:

- trim surrounding whitespace from `rawId`;
- reject an empty identifier after trimming;
- return the shared workspace prefix followed by the trimmed identifier;
- keep the implementation dependency-free.
