# Project API

The Project API is exposed as a REST surface under `/v1/projects` and related nested resources.

Current endpoints include:
- Project create, list, fetch, update, archive, restore, delete
- Data Source create, list, update, enable, disable, archive, delete
- Project invitation and member lifecycle endpoints

Request validation uses `zod`, and errors are mapped to structured JSON responses.
