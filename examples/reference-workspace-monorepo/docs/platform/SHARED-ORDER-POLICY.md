# Shared Order Platform Policy

Authority: ACCEPTED

Marker: SHARED-WORKSPACE-AUTHORITY

All order identifiers exposed by workspace packages use the stable `ord_` prefix followed by a non-empty caller-provided identifier.

Packages may depend on this policy only through an explicit Task Pack workspace-qualified governing reference. Repository layout alone does not grant authority.
