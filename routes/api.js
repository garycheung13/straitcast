var express = require('express');
var router = express.Router();
var request = require('request');
var xssFilters = require('xss-filters');
var xml2js = require('xml2js');
var sanitizeHTML = require('sanitize-html');
var admin = require('firebase-admin');
if (process.env.NODE_ENV === 'development') {
    require('dotenv').config();
}

const xmlparser = new xml2js.Parser({
    explicitArray: false,
    explicitRoot: false,
    mergeAttrs: true,
    trim: true,
    valueProcessors: [handleValues, stripNewLine]
});

function handleValues(value) {
    return sanitizeHTML(value, {
        allowedTags: ["br", "a"],
        allowedAttributes: {
            'a': ['href']
        }
    });
}

function stripNewLine(name) {
    return name.replace(/\n/g, '');
}

// wrapping the parser in a promise to use within another callback
function parserPromise(body) {
    return new Promise(function (resolve, reject) {
        xmlparser.parseString(body, function (err, result) {
            if (err) {
                reject(err);
            }
            resolve(result);
        })
    })
}

// firebase init
// the ternary is a workaround for the way that heroku needs the key formatted in prod
admin.initializeApp({
    credential: admin.credential.cert({
        privateKey: process.env.NODE_ENV === "development" ? process.env.FIREBASE_PRIVATE_KEY : JSON.parse(process.env.FIREBASE_PRIVATE_KEY),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
    databaseURL: process.env.FIREBASE_DB_LINK
});

const db = admin.database();
const queries = db.ref('queries'); // itunes cache
const feeds = db.ref('feeds'); // podcast data cache

/**
 * express request function wrapped with firebase caching
 *
 * @param {Object} snapshot (required) snapshot object returned from firebase reference call
 * @param {Object} pushRef (required) firebase db reference to location where cached data will
 * be pushed or updated.
 * @param {String} requestURI (required) fully form request uri as a string
 * @param {Function} callback (optional) if passed in as an argument,
 * function will transform the request results before returning a promise
 * @returns pending promise. resolves with one argument containing the data from the request
 */
function requestWithCaching(snapshot, pushRef, requestURI, callback) {
    const MILLISECONDS_IN_DAY = 86400000;
    const cachedData = snapshot.val();
    // also get the key if data was present
    const pushKey = cachedData ? Object.keys(cachedData)[0] : null;
    const currentTime = Date.now(); // current unix epoch time (same format as firebase)
    // if user callback is not defined, simply return the reponse body as a default callback
    const userCallback = callback || function (response, body) {
        return body;
    };
    return new Promise(function (resolve, reject) {
        // more than a day, or snapshot returned null
        if (!cachedData || cachedData[pushKey].timestamp + MILLISECONDS_IN_DAY < currentTime) {
            console.log("data not found or out of date, getting fresh data");
            request(requestURI, { headers: {"User-Agent": "Mozilla/5.0"}}, function (error, response, body) {
                if (error) {
                    reject(error);
                }
                // handle the transformation callback before talking to db
                Promise.resolve(userCallback.call(null, response, body)).then(function (value) {
                    // if pushkey not null, data was found, but was out of date so
                    // we perform update instead of push
                    if (pushKey) {
                        console.log("updating outdated data");
                        pushRef.child(pushKey).update({
                            requestURI: requestURI,
                            timestamp: admin.database.ServerValue.TIMESTAMP,
                            data: value,
                        })
                    } else {
                        console.log("pushing new data to db");
                        pushRef.push({
                            requestURI: requestURI,
                            timestamp: admin.database.ServerValue.TIMESTAMP,
                            data: value,
                        });
                    }
                    resolve(JSON.parse(value));
                });
            });
        } else {
            console.log("serving data from DB");
            // const pushKey = Object.keys(cachedData)[0]; // extracting the unique id
            resolve(JSON.parse(cachedData[pushKey].data));
        }
    });
}

router.post('/itunes/search', function (req, res, next) {
    const ITUNES_SEARCH_ENDPOINT = "https://itunes.apple.com/search?media=podcast&term=";
    const query = xssFilters.inHTMLData(req.body.query);
    const cachedRef = queries.orderByChild('requestURI').equalTo(ITUNES_SEARCH_ENDPOINT + query);
    cachedRef.once("value").then(function (snapshot) {
        return requestWithCaching(snapshot, queries, ITUNES_SEARCH_ENDPOINT + query);
    }).then(function (payload) {
        return res.json(payload);
    });
});

router.post('/parser', function (req, res, next) {
    // escaping to avoid xss before attempting decoding
    const feed = xssFilters.uriInHTMLData(req.body.feed);
    const cachedRef = feeds.orderByChild('requestURI').equalTo(feed);
    cachedRef.once("value").then(function (snapshot) {
        return requestWithCaching(snapshot, feeds, feed, function (res, body) {
            return parserPromise(body).then(function (result) {
                return JSON.stringify(result);
            });
        })
    }).then(function (payload) {
        return res.json(payload);
    });
});

module.exports = router;