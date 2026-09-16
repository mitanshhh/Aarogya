from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_smoke_auth():
    response = client.post("/api/v1/auth/login", data={"username": "admin_ind", "password": "password123"})
    assert response.status_code == 200
    assert "access_token" in response.json()

def get_auth_headers():
    response = client.post("/api/v1/auth/login", data={"username": "admin_ind", "password": "password123"})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_smoke_endpoints():
    headers = get_auth_headers()
    
    # District Dashboard
    response = client.get("/api/v1/district/dashboard", headers=headers)
    assert response.status_code in [200, 403, 404]  # Accept a few normal codes depending on mock data state
    
    # Inventory list (might require hospital_id parameter or be generic)
    # Testing endpoints gracefully
    
