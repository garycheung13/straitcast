# About the Project
Straitcast is a no frills web-based podcast player designed for playing individual podcast episodes. This repo contains the backend (Node.js) code. The frontend is connected to this repo as an submodule.

## Development Requirements
- Node.js version >= 6
- npm or yarn
- An working firebase database with service account credentials
- (Optional but recommended) Nodemon for restarting the local server while files update.

## Setup
1. Install dependancies by running `yarn install` or `npm install` from the command line.
2. If you don't have nodemon installed, install it now via `npm install -g nodemon`/`yarn global add nodemon`. If you don't want to install nodemon, simply replace nodemon with node in the package.json in the `dev-start` npm-script.
3. Create a `.env` file to store node environment variable. Add the following three entries.
    - `FIREBASE_PRIVATE_KEY`
    - `FIREBASE_CLIENT_EMAIL`
    - `FIREBASE_DB_LINK`
4. Start the development server by running `yarn run dev-start` or `npm run dev-start` from the command line.

## Heroku Config Vars
This project is hosted on a heroku server and uses the platforms config var settings to manage environment variables.