# This module defines the exact schema used for federated forecasting across all nations.
# This prevents drift between the nodes and the seed data generation.

FORECAST_FEATURES = [
    "days_since_last_restock",
    "rolling_7d_mean_consumption",
    "rolling_30d_mean_consumption",
    "patient_footfall_7d",
    "seasonality_index",
    "facility_size_bucket"
]

TARGET_VARIABLE = "next_7d_consumption"
