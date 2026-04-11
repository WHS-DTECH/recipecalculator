# Recipe Calculator

A web application for calculating shopping lists and managing recipes.

## Features
- Recipe management
- Shopping list calculation
- Class and catering bookings
- Admin tools for aisles, departments, and more

## Getting Started
1. Clone the repository
2. Install dependencies: `npm install` (in root and backend if needed)
3. Initialize the database: `npm run init-db` or see backend instructions
4. Start the server: `node backend/server.js`

## Deploying To Render
1. Push this repository to GitHub.
2. In Render, create a new Blueprint deploy (recommended) and select this repo.
3. Render will detect `render.yaml` and create `recipe-calculator-backend` from `backend/`.
4. Set required secret environment variables in Render:
	- `DATABASE_URL`
	- `ADMIN_BOOTSTRAP_EMAILS` (at least one bootstrap admin email)
5. Optional environment variables:
	- `PREFERRED_ADMIN_EMAIL`
	- `PGSSL_REJECT_UNAUTHORIZED`
	- `PGSSLMODE`

Use `backend/.env.example` as the reference for all backend environment keys.

## Folder Structure
- `backend/` - Node.js backend, SQL scripts, and admin/public files
- `KamarData/` - Data imports
- `Recipe_workspace/` - Workspace for recipes
- `todo/` - Project planning and checklists

## Contributing
Pull requests are welcome. For major changes, please open an issue first.

## License
[Specify your license here]
