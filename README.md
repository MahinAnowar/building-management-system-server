🏢 Building Management System (Server)

The backend REST API for the Building Management System. This Node.js/Express application handles data persistence, robust role-based authentication using JWT, and business logic for apartment leasing.

## 🔗 Project Links
- **📡 Live API:** https://building-management-system-server-eight.vercel.app/
- **💻 Client Repository:** https://github.com/MahinAnowar/building-management-system-client

## 🚀 Key Technical Features
- **JWT Security:** HttpOnly Cookies handling for secure, cross-site authentication (configured for Vercel/Chrome strict policies).
- **MongoDB Native Driver:** Direct database manipulation for high performance.
- **Middleware:** 
  - `verifyToken`: Protects private routes.
  - `verifyAdmin`: Ensures critical endpoints are accessible only by admins.
- **Pagination & Filtering:** Backend logic to handle apartment data chunking and search queries (`limit`, `skip`, `regex`).
- **Aggregation:** Advanced queries to calculate profile statistics (Occupancy rates, User vs Member counts).

## 🛠️ Technology Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (Atlas Cluster)
- **Authentication:** JSON Web Token (JWT)
- **Utilities:** Cookie Parser, CORS, Dotenv

## 📂 API Endpoints

### 🔐 Authentication
- `POST /jwt` - Generate access token.
- `POST /logout` - Clear access token cookie.

### 🏢 Apartments & Agreements
- `GET /apartments` - Fetch paginated apartment list (supports filters).
- `POST /agreements` - Create a lease agreement request.
- `GET /agreements` - Get all pending requests (Admin).
- `PUT /agreement/status/:id` - Approve/Reject requests (Triggers role change).

### 👥 User Management
- `POST /users` - Save or update user on login.
- `GET /user/role/:email` - Check if user is User/Member/Admin.
- `GET /members` - List all active tenants.
- `PATCH /user/demote/:id` - Remove member status.

### 🏷️ Admin Features
- `GET /admin-stats` - Get summary analytics.
- `POST /coupons` - Create new discount codes.
- `GET /coupons` - Retrieve available coupons.
- `POST /announcements` - Create a broadcast message.

## ⚙️ Environment Variables
To run this server locally, create a `.env` file:

```env
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password
ACCESS_TOKEN_SECRET=your_long_random_secret_string
NODE_ENV=development  # Use 'production' when deploying
PORT=5000
