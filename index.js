const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');
const { createDocument, getAllDocuments, deleteDocument } = require('./mongo.js');

dotenv.config();
const app = express();
app.use(express.json());

const getWeatherDetailsFromTomorrowio = async (lat, long) => {
    const url = "https://api.tomorrow.io/v4/timelines";
    const query = {
        fields: 'temperature,temperatureApparent,temperatureMin,temperatureMax,windSpeed,windDirection,humidity,pressureSeaLevel,uvIndex,weatherCode,precipitationProbability,precipitationType,sunriseTime,sunsetTime,visibility,moonPhase,cloudCover',
        timesteps: '1h,1d',
        units: 'imperial',
        timezone: 'America/Los_Angeles',
        location: `${lat},${long}`,
        apikey: process.env.TOMORROW_IO_KEY
    };
    const response = await axios.get(url, { params: query });
    return response.data;
};

const getCurrentWeatherDetailsFromTomorrowio = async (lat, long) => {
    const url = "https://api.tomorrow.io/v4/timelines";
    const query = {
        fields: 'temperature,windSpeed,humidity,pressureSeaLevel,uvIndex,weatherCode,visibility,cloudCover',
        timesteps: 'current',
        units: 'imperial',
        timezone: 'America/Los_Angeles',
        location: `${lat},${long}`,
        apikey: process.env.TOMORROW_IO_KEY
    };
    const response = await axios.get(url, { params: query });
    return response.data;
};

const getWeatherCodeDescription = (weatherCode) => {
    const data = JSON.parse(fs.readFileSync('weather_codes.json'));
    return data[weatherCode].description;
};

const getWeatherCodeImage = (weatherCode) => {
    const data = JSON.parse(fs.readFileSync('weather_codes.json'));
    return `/static/images/color/${data[weatherCode].image}`;
};

const getDateFormattedString2 = (datetimeString) => {
    const date = moment.tz(datetimeString, 'America/Los_Angeles');
    return date.format('dddd, DD MMM YYYY');
};

const getTimeFormattedStringForSunriseSunset = (datetimeString) => {
    const date = moment.tz(datetimeString, 'America/Los_Angeles');
    return date.format('hh:mma');
};

const createTodaysWeatherDetails = (weatherData) => {
    return weatherData.data.timelines[0].intervals.map((interval) => {
        const values = interval.values;
        return {
            date: getDateFormattedString2(interval.startTime),
            weatherCodeDescription: getWeatherCodeDescription(values.weatherCode),
            weatherCodeImage: getWeatherCodeImage(values.weatherCode),
            temperature: `${values.temperatureMax}°F/${values.temperatureMin}°F`,
            extra_values: [
                ['Precipitation', values.precipitation || 'N/A'],
                ['Chance of Rain', `${values.precipitationProbability}%`],
                ['Wind Speed', `${values.windSpeed} mph`],
                ['Humidity', `${values.humidity}%`],
                ['Visibility', `${values.visibility} mi`],
                ['Sunrise/Sunset', `${getTimeFormattedStringForSunriseSunset(values.sunriseTime)}/${getTimeFormattedStringForSunriseSunset(values.sunsetTime)}`]
            ]
        };
    });
};

app.get("/", (req, res) => {
    res.send("Hello, World!");
});

app.get("/get-weather-details", async (req, res) => {
    const { lat, long } = req.query;
    try {
        const weatherJson = await getWeatherDetailsFromTomorrowio(lat, long);
        const currentWeatherJson = await getCurrentWeatherDetailsFromTomorrowio(lat, long);

        const responseJson = {
            todays_details: createTodaysWeatherDetails(weatherJson),
            current_details: createTodaysWeatherDetails(currentWeatherJson)
        };
        res.json(responseJson);
    } catch (error) {
        console.error(error);
        res.sendStatus(503);
    }
});

app.use('/static', express.static(path.join(__dirname, 'static')));


app.post("/add-favorite", async (req, res) => {
    const {city, state} = req.body;
    try {
        await createDocument(state, city);
        res.sendStatus(201);
    } catch(err) {
        console.error(err);
        res.sendStatus(500);
    }
})

app.get("/get-favorites", async (req, res) => {
    try {
        let documents = await getAllDocuments()
        res.json(documents)
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
})

app.post("/delete-favorite", async (req, res) => {
    const {city, state} = req.body;
    try {
        await deleteDocument(state, city);
        res.sendStatus(200);
    } catch(err) {
        console.error(err);
        res.sendStatus(500);
    }
})

const port = 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

