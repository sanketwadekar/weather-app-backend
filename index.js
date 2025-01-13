const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const moment = require('moment-timezone');
const { createDocument, getAllDocuments, deleteDocument } = require('./mongo.js');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

global.apiKey = process.env.TOMORROW_IO_KEY

const getWeatherDetailsFromTomorrowio = async (lat, long) => {
    const url = "https://api.tomorrow.io/v4/timelines";
    const query = {
        fields: 'temperature,temperatureApparent,temperatureMin,temperatureMax,windSpeed,windDirection,humidity,pressureSeaLevel,uvIndex,weatherCode,precipitationProbability,precipitationType,sunriseTime,sunsetTime,visibility,moonPhase,cloudCover',
        timesteps: '1h,1d',
        units: 'imperial',
        timezone: 'America/Los_Angeles',
        location: `${lat},${long}`,
        apikey: global.apiKey
    };
    const response = await axios.get(url, { params: query });
    if (response.status !== 200) {
        apiKey = process.env.TOMORROW_IO_KEY_2
    }
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
        apikey: global.apiKey
    };
    const response = await axios.get(url, { params: query });
    if (response.status !== 200) {
        apiKey = process.env.TOMORROW_IO_KEY_2
    }
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
    return date.format('hh:mmA');
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


function createDailyWeatherTable(weatherJson) {
    return weatherJson.data.timelines[0].intervals.map((interval) => {
        const weatherDetails = interval.values;
        return {
            date: getDateFormattedString2(interval.startTime),
            weatherCodeDescription: getWeatherCodeDescription(weatherDetails.weatherCode),
            weatherCodeImage: getWeatherCodeImage(weatherDetails.weatherCode),
            temperatureMax: weatherDetails.temperatureMax.toString(),
            temperatureMin: weatherDetails.temperatureMin.toString(),
            windSpeed: weatherDetails.windSpeed.toString(),
            sunriseTime: getTimeFormattedStringForSunriseSunset(weatherDetails.sunriseTime),
            sunsetTime: getTimeFormattedStringForSunriseSunset(weatherDetails.sunsetTime),
            cloudCover: weatherDetails.cloudCover.toString() + "%",
            visibility: weatherDetails.visibility.toString() + "mi",
            apparentTemperature: weatherDetails.temperatureApparent.toString(),
            humidity: weatherDetails.humidity.toString(),
            pressure: `${weatherDetails.pressureSeaLevel}inHg`,
            temperature: weatherDetails.temperature,
            precipitationProbability: weatherDetails.precipitationProbability,
            uvIndex: weatherDetails.uvIndex
        };
    });
}

function getEpochTimeFromDatetimeString(datetimeString) {
    const dt = new Date(datetimeString);
    return dt.getTime();
}

function createTemperatureRangeChart(weatherJson) {
    return weatherJson.data.timelines[0].intervals.map((interval) => {
        const weatherDetails = interval.values;
        return [
            getEpochTimeFromDatetimeString(interval.startTime),
            weatherDetails.temperatureMin,
            weatherDetails.temperatureMax
        ];
    });
}

function createHourlyChart(weatherJson) {
    const hourlyChart = { temperature: [], wind: [], humidity: [], pressure: [] };
    const hourlyData = weatherJson.data.timelines[1].intervals;
    let to = (Math.floor(Date.now() / 1000) + 3600 * 24 * 5) * 1000;

    hourlyData.forEach((interval, i) => {
        const x = getEpochTimeFromDatetimeString(interval.startTime);
        to = x + 3600000;

        if (i === 0) {
            var pointStart = (x + to) / 2;
        }

        if (to > pointStart + 24 * 3600000 * 5) {
            return hourlyChart;
        }

        hourlyChart.temperature.push({ x, y: interval.values.temperature, to });
        hourlyChart.humidity.push({ x, y: interval.values.humidity });
        hourlyChart.pressure.push({ x, y: interval.values.pressureSeaLevel });

        if (i % 2 === 0) {
            hourlyChart.wind.push({
                x,
                value: interval.values.windSpeed,
                direction: interval.values.windDirection
            });
        }
    });

    return hourlyChart;
}

app.get("/", (req, res) => {
    res.send("Hello, World!");
});

app.get("/get-weather-details", async (req, res) => {
    const { lat, long } = req.query;
    try {
        const weatherJson = await getWeatherDetailsFromTomorrowio(lat, long);
        // const currentWeatherJson = await getCurrentWeatherDetailsFromTomorrowio(lat, long);

        const responseJson = {
            todays_details: createTodaysWeatherDetails(weatherJson),
            // current_details: createTodaysWeatherDetails(currentWeatherJson)
        };

        responseJson.daily_details = createDailyWeatherTable(weatherJson);
        responseJson.temperature_range_chart = createTemperatureRangeChart(weatherJson);
        responseJson.hourly_chart = createHourlyChart(weatherJson);

        res.json(responseJson);
    } catch (error) {
        if (global.apiKey == process.env.TOMORROW_IO_KEY) {
            global.apiKey = process.env.TOMORROW_IO_KEY_2
        } else {
            global.apiKey = process.env.TOMORROW_IO_KEY
        }
        console.error(error);
        res.sendStatus(503);
    }
});

app.get("/get-test-weather-details", async (req, res) => {
    const { lat, long } = req.query;
    try {
        res.json(testData);
    } catch (error) {
        console.error(error);
        res.sendStatus(503);
    }
});

app.use('/static', express.static(path.join(__dirname, 'static')));


app.post("/add-favorite", async (req, res) => {
    const { city, state } = req.body;
    try {
        await createDocument(state, city);
        res.sendStatus(201);
    } catch (err) {
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
    const { city, state } = req.body;
    try {
        await deleteDocument(state, city);
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
})

app.get("/autocomplete", async (req, res) => {
    try {
        const { input } = req.query;
        let config = {
            method: 'get',
            url: `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${input}&components=country:us&key=${process.env.GOOGLE_API_KEY}&types=%28cities%29`,
        };

        let response = await axios.request(config);
        res.json(response.data);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
})

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});



const testData = {
    "todays_details": [
    {
    "date": "Thursday, 28 Nov 2024",
    "weatherCodeDescription": "Cloudy",
    "weatherCodeImage": "/static/images/color/cloudy.svg",
    "temperature": "75.88°F/52.48°F",
    "extra_values": [
    [
    "Precipitation",
    "N/A"
    ],
    [
    "Chance of Rain",
    "0%"
    ],
    [
    "Wind Speed",
    "7.36 mph"
    ],
    [
    "Humidity",
    "91%"
    ],
    [
    "Visibility",
    "9.94 mi"
    ],
    [
    "Sunrise/Sunset",
    "06:30AM/04:52PM"
    ]
    ]
    },
    {
    "date": "Friday, 29 Nov 2024",
    "weatherCodeDescription": "Cloudy",
    "weatherCodeImage": "/static/images/color/cloudy.svg",
    "temperature": "71.6°F/52.47°F",
    "extra_values": [
    [
    "Precipitation",
    "N/A"
    ],
    [
    "Chance of Rain",
    "0%"
    ],
    [
    "Wind Speed",
    "7.6 mph"
    ],
    [
    "Humidity",
    "65.95%"
    ],
    [
    "Visibility",
    "9.94 mi"
    ],
    [
    "Sunrise/Sunset",
    "06:31AM/04:52PM"
    ]
    ]
    },
    {
    "date": "Saturday, 30 Nov 2024",
    "weatherCodeDescription": "Cloudy",
    "weatherCodeImage": "/static/images/color/cloudy.svg",
    "temperature": "78.6°F/53.3°F",
    "extra_values": [
    [
    "Precipitation",
    "N/A"
    ],
    [
    "Chance of Rain",
    "0%"
    ],
    [
    "Wind Speed",
    "7.68 mph"
    ],
    [
    "Humidity",
    "35.21%"
    ],
    [
    "Visibility",
    "9.94 mi"
    ],
    [
    "Sunrise/Sunset",
    "06:32AM/04:52PM"
    ]
    ]
    },
    {
    "date": "Sunday, 01 Dec 2024",
    "weatherCodeDescription": "Clear, Sunny",
    "weatherCodeImage": "/static/images/color/clear_day.svg",
    "temperature": "76.38°F/53.66°F",
    "extra_values": [
    [
    "Precipitation",
    "N/A"
    ],
    [
    "Chance of Rain",
    "0%"
    ],
    [
    "Wind Speed",
    "5.79 mph"
    ],
    [
    "Humidity",
    "48.32%"
    ],
    [
    "Visibility",
    "15 mi"
    ],
    [
    "Sunrise/Sunset",
    "06:32AM/04:52PM"
    ]
    ]
    },
    {
    "date": "Monday, 02 Dec 2024",
    "weatherCodeDescription": "Cloudy",
    "weatherCodeImage": "/static/images/color/cloudy.svg",
    "temperature": "73.55°F/62.08°F",
    "extra_values": [
    [
    "Precipitation",
    "N/A"
    ],
    [
    "Chance of Rain",
    "0%"
    ],
    [
    "Wind Speed",
    "7.45 mph"
    ],
    [
    "Humidity",
    "37.14%"
    ],
    [
    "Visibility",
    "15 mi"
    ],
    [
    "Sunrise/Sunset",
    "06:33AM/04:52PM"
    ]
    ]
    },
    {
    "date": "Tuesday, 03 Dec 2024",
    "weatherCodeDescription": "Cloudy",
    "weatherCodeImage": "/static/images/color/cloudy.svg",
    "temperature": "72.77°F/60.92°F",
    "extra_values": [
    [
    "Precipitation",
    "N/A"
    ],
    [
    "Chance of Rain",
    "0%"
    ],
    [
    "Wind Speed",
    "5.34 mph"
    ],
    [
    "Humidity",
    "39.02%"
    ],
    [
    "Visibility",
    "15 mi"
    ],
    [
    "Sunrise/Sunset",
    "06:34AM/04:52PM"
    ]
    ]
    },
    {
    "date": "Wednesday, 04 Dec 2024",
    "weatherCodeDescription": "Clear, Sunny",
    "weatherCodeImage": "/static/images/color/clear_day.svg",
    "temperature": "72.28°F/60.97°F",
    "extra_values": [
    [
    "Precipitation",
    "N/A"
    ],
    [
    "Chance of Rain",
    "0%"
    ],
    [
    "Wind Speed",
    "7.61 mph"
    ],
    [
    "Humidity",
    "36.27%"
    ],
    [
    "Visibility",
    "15 mi"
    ],
    [
    "Sunrise/Sunset",
    "06:34AM/04:52PM"
    ]
    ]
    }
    ],
    "daily_details": [
    {
    "date": "Thursday, 28 Nov 2024",
    "weatherCodeDescription": "Cloudy",
    "weatherCodeImage": "/static/images/color/cloudy.svg",
    "temperatureMax": "75.88",
    "temperatureMin": "52.48",
    "windSpeed": "7.36",
    "sunriseTime": "06:30AM",
    "sunsetTime": "04:52PM",
    "cloudCover": "100%",
    "visibility": "9.94mi",
    "apparentTemperature": "75.88",
    "humidity": "91",
    "pressure": "30.07inHg",
    "temperature": 75.88,
    "precipitationProbability": 0,
    "uvIndex": 3
    },
    {
    "date": "Friday, 29 Nov 2024",
    "weatherCodeDescription": "Cloudy",
    "weatherCodeImage": "/static/images/color/cloudy.svg",
    "temperatureMax": "71.6",
    "temperatureMin": "52.47",
    "windSpeed": "7.6",
    "sunriseTime": "06:31AM",
    "sunsetTime": "04:52PM",
    "cloudCover": "100%",
    "visibility": "9.94mi",
    "apparentTemperature": "71.6",
    "humidity": "65.95",
    "pressure": "30.06inHg",
    "temperature": 71.6,
    "precipitationProbability": 0,
    "uvIndex": 2
    },
    {
    "date": "Saturday, 30 Nov 2024",
    "weatherCodeDescription": "Cloudy",
    "weatherCodeImage": "/static/images/color/cloudy.svg",
    "temperatureMax": "78.6",
    "temperatureMin": "53.3",
    "windSpeed": "7.68",
    "sunriseTime": "06:32AM",
    "sunsetTime": "04:52PM",
    "cloudCover": "100%",
    "visibility": "9.94mi",
    "apparentTemperature": "78.6",
    "humidity": "35.21",
    "pressure": "30.08inHg",
    "temperature": 78.6,
    "precipitationProbability": 0,
    "uvIndex": 3
    },
    {
    "date": "Sunday, 01 Dec 2024",
    "weatherCodeDescription": "Clear, Sunny",
    "weatherCodeImage": "/static/images/color/clear_day.svg",
    "temperatureMax": "76.38",
    "temperatureMin": "53.66",
    "windSpeed": "5.79",
    "sunriseTime": "06:32AM",
    "sunsetTime": "04:52PM",
    "cloudCover": "28.91%",
    "visibility": "15mi",
    "apparentTemperature": "76.38",
    "humidity": "48.32",
    "pressure": "30.14inHg",
    "temperature": 76.38,
    "precipitationProbability": 0,
    "uvIndex": 3
    },
    {
    "date": "Monday, 02 Dec 2024",
    "weatherCodeDescription": "Cloudy",
    "weatherCodeImage": "/static/images/color/cloudy.svg",
    "temperatureMax": "73.55",
    "temperatureMin": "62.08",
    "windSpeed": "7.45",
    "sunriseTime": "06:33AM",
    "sunsetTime": "04:52PM",
    "cloudCover": "100%",
    "visibility": "15mi",
    "apparentTemperature": "73.55",
    "humidity": "37.14",
    "pressure": "30.09inHg",
    "temperature": 73.55,
    "precipitationProbability": 0,
    "uvIndex": 2
    },
    {
    "date": "Tuesday, 03 Dec 2024",
    "weatherCodeDescription": "Cloudy",
    "weatherCodeImage": "/static/images/color/cloudy.svg",
    "temperatureMax": "72.77",
    "temperatureMin": "60.92",
    "windSpeed": "5.34",
    "sunriseTime": "06:34AM",
    "sunsetTime": "04:52PM",
    "cloudCover": "100%",
    "visibility": "15mi",
    "apparentTemperature": "72.77",
    "humidity": "39.02",
    "pressure": "30.08inHg",
    "temperature": 72.77,
    "precipitationProbability": 0
    },
    {
    "date": "Wednesday, 04 Dec 2024",
    "weatherCodeDescription": "Clear, Sunny",
    "weatherCodeImage": "/static/images/color/clear_day.svg",
    "temperatureMax": "72.28",
    "temperatureMin": "60.97",
    "windSpeed": "7.61",
    "sunriseTime": "06:34AM",
    "sunsetTime": "04:52PM",
    "cloudCover": "19.22%",
    "visibility": "15mi",
    "apparentTemperature": "72.28",
    "humidity": "36.27",
    "pressure": "30.13inHg",
    "temperature": 72.28,
    "precipitationProbability": 0
    }
    ],
    "temperature_range_chart": [
    [
    1732802400000,
    52.48,
    75.88
    ],
    [
    1732888800000,
    52.47,
    71.6
    ],
    [
    1732975200000,
    53.3,
    78.6
    ],
    [
    1733061600000,
    53.66,
    76.38
    ],
    [
    1733148000000,
    62.08,
    73.55
    ],
    [
    1733234400000,
    60.92,
    72.77
    ],
    [
    1733320800000,
    60.97,
    72.28
    ]
    ],
    "hourly_chart": {
    "temperature": [
    {
    "x": 1732842000000,
    "y": 67.66,
    "to": 1732845600000
    },
    {
    "x": 1732845600000,
    "y": 61.54,
    "to": 1732849200000
    },
    {
    "x": 1732849200000,
    "y": 59.96,
    "to": 1732852800000
    },
    {
    "x": 1732852800000,
    "y": 58.86,
    "to": 1732856400000
    },
    {
    "x": 1732856400000,
    "y": 57.74,
    "to": 1732860000000
    },
    {
    "x": 1732860000000,
    "y": 56.16,
    "to": 1732863600000
    },
    {
    "x": 1732863600000,
    "y": 54.73,
    "to": 1732867200000
    },
    {
    "x": 1732867200000,
    "y": 54.49,
    "to": 1732870800000
    },
    {
    "x": 1732870800000,
    "y": 54.34,
    "to": 1732874400000
    },
    {
    "x": 1732874400000,
    "y": 53.51,
    "to": 1732878000000
    },
    {
    "x": 1732878000000,
    "y": 53.14,
    "to": 1732881600000
    },
    {
    "x": 1732881600000,
    "y": 53.3,
    "to": 1732885200000
    },
    {
    "x": 1732885200000,
    "y": 53.28,
    "to": 1732888800000
    },
    {
    "x": 1732888800000,
    "y": 53.12,
    "to": 1732892400000
    },
    {
    "x": 1732892400000,
    "y": 52.47,
    "to": 1732896000000
    },
    {
    "x": 1732896000000,
    "y": 55.32,
    "to": 1732899600000
    },
    {
    "x": 1732899600000,
    "y": 59.9,
    "to": 1732903200000
    },
    {
    "x": 1732903200000,
    "y": 64.4,
    "to": 1732906800000
    },
    {
    "x": 1732906800000,
    "y": 67.84,
    "to": 1732910400000
    },
    {
    "x": 1732910400000,
    "y": 69.8,
    "to": 1732914000000
    },
    {
    "x": 1732914000000,
    "y": 71.6,
    "to": 1732917600000
    },
    {
    "x": 1732917600000,
    "y": 71.6,
    "to": 1732921200000
    },
    {
    "x": 1732921200000,
    "y": 70.12,
    "to": 1732924800000
    },
    {
    "x": 1732924800000,
    "y": 67.26,
    "to": 1732928400000
    },
    {
    "x": 1732928400000,
    "y": 63.96,
    "to": 1732932000000
    },
    {
    "x": 1732932000000,
    "y": 61.61,
    "to": 1732935600000
    },
    {
    "x": 1732935600000,
    "y": 59.4,
    "to": 1732939200000
    },
    {
    "x": 1732939200000,
    "y": 57.36,
    "to": 1732942800000
    },
    {
    "x": 1732942800000,
    "y": 55.95,
    "to": 1732946400000
    },
    {
    "x": 1732946400000,
    "y": 54.82,
    "to": 1732950000000
    },
    {
    "x": 1732950000000,
    "y": 53.92,
    "to": 1732953600000
    },
    {
    "x": 1732953600000,
    "y": 53.32,
    "to": 1732957200000
    },
    {
    "x": 1732957200000,
    "y": 54.13,
    "to": 1732960800000
    },
    {
    "x": 1732960800000,
    "y": 55.24,
    "to": 1732964400000
    },
    {
    "x": 1732964400000,
    "y": 55.1,
    "to": 1732968000000
    },
    {
    "x": 1732968000000,
    "y": 54.58,
    "to": 1732971600000
    },
    {
    "x": 1732971600000,
    "y": 53.68,
    "to": 1732975200000
    },
    {
    "x": 1732975200000,
    "y": 53.3,
    "to": 1732978800000
    },
    {
    "x": 1732978800000,
    "y": 53.3,
    "to": 1732982400000
    },
    {
    "x": 1732982400000,
    "y": 56.39,
    "to": 1732986000000
    },
    {
    "x": 1732986000000,
    "y": 62.6,
    "to": 1732989600000
    },
    {
    "x": 1732989600000,
    "y": 68.34,
    "to": 1732993200000
    },
    {
    "x": 1732993200000,
    "y": 74.17,
    "to": 1732996800000
    },
    {
    "x": 1732996800000,
    "y": 77.66,
    "to": 1733000400000
    },
    {
    "x": 1733000400000,
    "y": 78.28,
    "to": 1733004000000
    },
    {
    "x": 1733004000000,
    "y": 78.6,
    "to": 1733007600000
    },
    {
    "x": 1733007600000,
    "y": 76.32,
    "to": 1733011200000
    },
    {
    "x": 1733011200000,
    "y": 71.45,
    "to": 1733014800000
    },
    {
    "x": 1733014800000,
    "y": 67.05,
    "to": 1733018400000
    },
    {
    "x": 1733018400000,
    "y": 65.37,
    "to": 1733022000000
    },
    {
    "x": 1733022000000,
    "y": 63.79,
    "to": 1733025600000
    },
    {
    "x": 1733025600000,
    "y": 63.25,
    "to": 1733029200000
    },
    {
    "x": 1733029200000,
    "y": 62.29,
    "to": 1733032800000
    },
    {
    "x": 1733032800000,
    "y": 60.22,
    "to": 1733036400000
    },
    {
    "x": 1733036400000,
    "y": 59.26,
    "to": 1733040000000
    },
    {
    "x": 1733040000000,
    "y": 57.91,
    "to": 1733043600000
    },
    {
    "x": 1733043600000,
    "y": 58.05,
    "to": 1733047200000
    },
    {
    "x": 1733047200000,
    "y": 57.64,
    "to": 1733050800000
    },
    {
    "x": 1733050800000,
    "y": 56.73,
    "to": 1733054400000
    },
    {
    "x": 1733054400000,
    "y": 55.7,
    "to": 1733058000000
    },
    {
    "x": 1733058000000,
    "y": 55.75,
    "to": 1733061600000
    },
    {
    "x": 1733061600000,
    "y": 54.35,
    "to": 1733065200000
    },
    {
    "x": 1733065200000,
    "y": 53.66,
    "to": 1733068800000
    },
    {
    "x": 1733068800000,
    "y": 57.12,
    "to": 1733072400000
    },
    {
    "x": 1733072400000,
    "y": 63.41,
    "to": 1733076000000
    },
    {
    "x": 1733076000000,
    "y": 68.42,
    "to": 1733079600000
    },
    {
    "x": 1733079600000,
    "y": 72.2,
    "to": 1733083200000
    },
    {
    "x": 1733083200000,
    "y": 75.09,
    "to": 1733086800000
    },
    {
    "x": 1733086800000,
    "y": 76.38,
    "to": 1733090400000
    },
    {
    "x": 1733090400000,
    "y": 76.24,
    "to": 1733094000000
    },
    {
    "x": 1733094000000,
    "y": 73.92,
    "to": 1733097600000
    },
    {
    "x": 1733097600000,
    "y": 69.02,
    "to": 1733101200000
    },
    {
    "x": 1733101200000,
    "y": 63.99,
    "to": 1733104800000
    },
    {
    "x": 1733104800000,
    "y": 62.26,
    "to": 1733108400000
    },
    {
    "x": 1733108400000,
    "y": 61.14,
    "to": 1733112000000
    },
    {
    "x": 1733112000000,
    "y": 60.17,
    "to": 1733115600000
    },
    {
    "x": 1733115600000,
    "y": 59.96,
    "to": 1733119200000
    },
    {
    "x": 1733119200000,
    "y": 59.97,
    "to": 1733122800000
    },
    {
    "x": 1733122800000,
    "y": 60.13,
    "to": 1733126400000
    },
    {
    "x": 1733126400000,
    "y": 60.4,
    "to": 1733130000000
    },
    {
    "x": 1733130000000,
    "y": 60.71,
    "to": 1733133600000
    },
    {
    "x": 1733133600000,
    "y": 60.83,
    "to": 1733137200000
    },
    {
    "x": 1733137200000,
    "y": 61.18,
    "to": 1733140800000
    },
    {
    "x": 1733140800000,
    "y": 61.78,
    "to": 1733144400000
    },
    {
    "x": 1733144400000,
    "y": 62.41,
    "to": 1733148000000
    },
    {
    "x": 1733148000000,
    "y": 62.21,
    "to": 1733151600000
    },
    {
    "x": 1733151600000,
    "y": 62.08,
    "to": 1733155200000
    },
    {
    "x": 1733155200000,
    "y": 63.47,
    "to": 1733158800000
    },
    {
    "x": 1733158800000,
    "y": 65.99,
    "to": 1733162400000
    },
    {
    "x": 1733162400000,
    "y": 68.61,
    "to": 1733166000000
    },
    {
    "x": 1733166000000,
    "y": 70.72,
    "to": 1733169600000
    },
    {
    "x": 1733169600000,
    "y": 72.37,
    "to": 1733173200000
    },
    {
    "x": 1733173200000,
    "y": 73.55,
    "to": 1733176800000
    },
    {
    "x": 1733176800000,
    "y": 72.99,
    "to": 1733180400000
    },
    {
    "x": 1733180400000,
    "y": 70.7,
    "to": 1733184000000
    },
    {
    "x": 1733184000000,
    "y": 68.13,
    "to": 1733187600000
    },
    {
    "x": 1733187600000,
    "y": 66.39,
    "to": 1733191200000
    },
    {
    "x": 1733191200000,
    "y": 65.82,
    "to": 1733194800000
    },
    {
    "x": 1733194800000,
    "y": 65.3,
    "to": 1733198400000
    },
    {
    "x": 1733198400000,
    "y": 64.78,
    "to": 1733202000000
    },
    {
    "x": 1733202000000,
    "y": 64.48,
    "to": 1733205600000
    },
    {
    "x": 1733205600000,
    "y": 64,
    "to": 1733209200000
    },
    {
    "x": 1733209200000,
    "y": 63.85,
    "to": 1733212800000
    },
    {
    "x": 1733212800000,
    "y": 63.69,
    "to": 1733216400000
    },
    {
    "x": 1733216400000,
    "y": 63.38,
    "to": 1733220000000
    },
    {
    "x": 1733220000000,
    "y": 63.27,
    "to": 1733223600000
    },
    {
    "x": 1733223600000,
    "y": 63.1,
    "to": 1733227200000
    },
    {
    "x": 1733227200000,
    "y": 62.88,
    "to": 1733230800000
    },
    {
    "x": 1733230800000,
    "y": 62.9,
    "to": 1733234400000
    },
    {
    "x": 1733234400000,
    "y": 62.72,
    "to": 1733238000000
    },
    {
    "x": 1733238000000,
    "y": 62.63,
    "to": 1733241600000
    },
    {
    "x": 1733241600000,
    "y": 63.78,
    "to": 1733245200000
    },
    {
    "x": 1733245200000,
    "y": 66.09,
    "to": 1733248800000
    },
    {
    "x": 1733248800000,
    "y": 68.35,
    "to": 1733252400000
    },
    {
    "x": 1733252400000,
    "y": 69.83,
    "to": 1733256000000
    },
    {
    "x": 1733256000000,
    "y": 71.3,
    "to": 1733259600000
    },
    {
    "x": 1733259600000,
    "y": 72.77,
    "to": 1733263200000
    },
    {
    "x": 1733263200000,
    "y": 71.53,
    "to": 1733266800000
    },
    {
    "x": 1733266800000,
    "y": 70.3,
    "to": 1733270400000
    },
    {
    "x": 1733270400000,
    "y": 69.06,
    "to": 1733274000000
    },
    {
    "x": 1733274000000,
    "y": 67.58,
    "to": 1733277600000
    }
    ],
    "wind": [
    {
    "x": 1732842000000,
    "value": 3.78,
    "direction": 173.38
    },
    {
    "x": 1732849200000,
    "value": 4.72,
    "direction": 34.05
    },
    {
    "x": 1732856400000,
    "value": 6.58,
    "direction": 36.26
    },
    {
    "x": 1732863600000,
    "value": 6.84,
    "direction": 58.31
    },
    {
    "x": 1732870800000,
    "value": 7.22,
    "direction": 60.36
    },
    {
    "x": 1732878000000,
    "value": 7.27,
    "direction": 42.92
    },
    {
    "x": 1732885200000,
    "value": 6.98,
    "direction": 33.33
    },
    {
    "x": 1732892400000,
    "value": 6.42,
    "direction": 65.53
    },
    {
    "x": 1732899600000,
    "value": 7.58,
    "direction": 75.9
    },
    {
    "x": 1732906800000,
    "value": 6.45,
    "direction": 89.85
    },
    {
    "x": 1732914000000,
    "value": 7.42,
    "direction": 91.7
    },
    {
    "x": 1732921200000,
    "value": 6.52,
    "direction": 120.34
    },
    {
    "x": 1732928400000,
    "value": 7.6,
    "direction": 242.87
    },
    {
    "x": 1732935600000,
    "value": 6.11,
    "direction": 246.97
    },
    {
    "x": 1732942800000,
    "value": 6.05,
    "direction": 118.67
    },
    {
    "x": 1732950000000,
    "value": 6.28,
    "direction": 82.87
    },
    {
    "x": 1732957200000,
    "value": 7.53,
    "direction": 60.61
    },
    {
    "x": 1732964400000,
    "value": 7.18,
    "direction": 44.97
    },
    {
    "x": 1732971600000,
    "value": 7.49,
    "direction": 60.61
    },
    {
    "x": 1732978800000,
    "value": 7.63,
    "direction": 61.03
    },
    {
    "x": 1732986000000,
    "value": 6.94,
    "direction": 64.41
    },
    {
    "x": 1732993200000,
    "value": 1.55,
    "direction": 39.36
    },
    {
    "x": 1733000400000,
    "value": 1.1,
    "direction": 80.1
    },
    {
    "x": 1733007600000,
    "value": 2.64,
    "direction": 231.64
    },
    {
    "x": 1733014800000,
    "value": 4.83,
    "direction": 256.24
    },
    {
    "x": 1733022000000,
    "value": 0.27,
    "direction": 347.04
    },
    {
    "x": 1733029200000,
    "value": 0.96,
    "direction": 164.25
    },
    {
    "x": 1733036400000,
    "value": 0.41,
    "direction": 265.33
    },
    {
    "x": 1733043600000,
    "value": 1.75,
    "direction": 29.48
    },
    {
    "x": 1733050800000,
    "value": 0.98,
    "direction": 153.15
    },
    {
    "x": 1733058000000,
    "value": 1.79,
    "direction": 23.76
    },
    {
    "x": 1733065200000,
    "value": 1.43,
    "direction": 325.3
    },
    {
    "x": 1733072400000,
    "value": 0.54,
    "direction": 240.26
    },
    {
    "x": 1733079600000,
    "value": 1.17,
    "direction": 171.83
    },
    {
    "x": 1733086800000,
    "value": 2.62,
    "direction": 205.57
    },
    {
    "x": 1733094000000,
    "value": 4.91,
    "direction": 221.8
    },
    {
    "x": 1733101200000,
    "value": 5.16,
    "direction": 249.95
    },
    {
    "x": 1733108400000,
    "value": 1.86,
    "direction": 231.8
    },
    {
    "x": 1733115600000,
    "value": 1.17,
    "direction": 159.18
    },
    {
    "x": 1733122800000,
    "value": 1.29,
    "direction": 66.21
    },
    {
    "x": 1733130000000,
    "value": 1.87,
    "direction": 175.64
    },
    {
    "x": 1733137200000,
    "value": 1.61,
    "direction": 133.31
    },
    {
    "x": 1733144400000,
    "value": 1.06,
    "direction": 67.52
    },
    {
    "x": 1733151600000,
    "value": 1.32,
    "direction": 99.93
    },
    {
    "x": 1733158800000,
    "value": 1.04,
    "direction": 35.82
    },
    {
    "x": 1733166000000,
    "value": 3.23,
    "direction": 204.29
    },
    {
    "x": 1733173200000,
    "value": 4.92,
    "direction": 236.32
    },
    {
    "x": 1733180400000,
    "value": 7.45,
    "direction": 244.17
    },
    {
    "x": 1733187600000,
    "value": 5.13,
    "direction": 241.66
    },
    {
    "x": 1733194800000,
    "value": 2.55,
    "direction": 231.52
    },
    {
    "x": 1733202000000,
    "value": 2.11,
    "direction": 162.63
    },
    {
    "x": 1733209200000,
    "value": 1.4,
    "direction": 132.67
    },
    {
    "x": 1733216400000,
    "value": 0.79,
    "direction": 263.18
    },
    {
    "x": 1733223600000,
    "value": 0.78,
    "direction": 183.68
    },
    {
    "x": 1733230800000,
    "value": 1.01,
    "direction": 166.9
    },
    {
    "x": 1733238000000,
    "value": 0.75,
    "direction": 169.31
    },
    {
    "x": 1733245200000,
    "value": 0.74,
    "direction": 232.77
    },
    {
    "x": 1733252400000,
    "value": 2.44,
    "direction": 203.46
    },
    {
    "x": 1733259600000,
    "value": 4.13,
    "direction": 223.75
    },
    {
    "x": 1733266800000,
    "value": 4.93,
    "direction": 235.69
    },
    {
    "x": 1733274000000,
    "value": 4.77,
    "direction": 235.69
    }
    ],
    "humidity": [
    {
    "x": 1732842000000,
    "y": 32
    },
    {
    "x": 1732845600000,
    "y": 57.5
    },
    {
    "x": 1732849200000,
    "y": 59.54
    },
    {
    "x": 1732852800000,
    "y": 55.61
    },
    {
    "x": 1732856400000,
    "y": 43.71
    },
    {
    "x": 1732860000000,
    "y": 39.92
    },
    {
    "x": 1732863600000,
    "y": 37.36
    },
    {
    "x": 1732867200000,
    "y": 36.05
    },
    {
    "x": 1732870800000,
    "y": 35.23
    },
    {
    "x": 1732874400000,
    "y": 34.66
    },
    {
    "x": 1732878000000,
    "y": 31.82
    },
    {
    "x": 1732881600000,
    "y": 28.47
    },
    {
    "x": 1732885200000,
    "y": 27.14
    },
    {
    "x": 1732888800000,
    "y": 26.4
    },
    {
    "x": 1732892400000,
    "y": 27.72
    },
    {
    "x": 1732896000000,
    "y": 26.86
    },
    {
    "x": 1732899600000,
    "y": 23.59
    },
    {
    "x": 1732903200000,
    "y": 20.1
    },
    {
    "x": 1732906800000,
    "y": 17.59
    },
    {
    "x": 1732910400000,
    "y": 15.71
    },
    {
    "x": 1732914000000,
    "y": 14.65
    },
    {
    "x": 1732917600000,
    "y": 16
    },
    {
    "x": 1732921200000,
    "y": 19.03
    },
    {
    "x": 1732924800000,
    "y": 26.13
    },
    {
    "x": 1732928400000,
    "y": 37.38
    },
    {
    "x": 1732932000000,
    "y": 44.49
    },
    {
    "x": 1732935600000,
    "y": 53.59
    },
    {
    "x": 1732939200000,
    "y": 63.05
    },
    {
    "x": 1732942800000,
    "y": 65.95
    },
    {
    "x": 1732946400000,
    "y": 65
    },
    {
    "x": 1732950000000,
    "y": 62.85
    },
    {
    "x": 1732953600000,
    "y": 57.69
    },
    {
    "x": 1732957200000,
    "y": 48.56
    },
    {
    "x": 1732960800000,
    "y": 39.2
    },
    {
    "x": 1732964400000,
    "y": 32.7
    },
    {
    "x": 1732968000000,
    "y": 29.69
    },
    {
    "x": 1732971600000,
    "y": 28.86
    },
    {
    "x": 1732975200000,
    "y": 28.53
    },
    {
    "x": 1732978800000,
    "y": 28.27
    },
    {
    "x": 1732982400000,
    "y": 25.72
    },
    {
    "x": 1732986000000,
    "y": 22.29
    },
    {
    "x": 1732989600000,
    "y": 14.03
    },
    {
    "x": 1732993200000,
    "y": 10.29
    },
    {
    "x": 1732996800000,
    "y": 8.63
    },
    {
    "x": 1733000400000,
    "y": 8.04
    },
    {
    "x": 1733004000000,
    "y": 7.82
    },
    {
    "x": 1733007600000,
    "y": 9.86
    },
    {
    "x": 1733011200000,
    "y": 15.49
    },
    {
    "x": 1733014800000,
    "y": 20.29
    },
    {
    "x": 1733018400000,
    "y": 24.27
    },
    {
    "x": 1733022000000,
    "y": 30.98
    },
    {
    "x": 1733025600000,
    "y": 29.4
    },
    {
    "x": 1733029200000,
    "y": 28.29
    },
    {
    "x": 1733032800000,
    "y": 30.27
    },
    {
    "x": 1733036400000,
    "y": 33.88
    },
    {
    "x": 1733040000000,
    "y": 35.21
    },
    {
    "x": 1733043600000,
    "y": 34.78
    },
    {
    "x": 1733047200000,
    "y": 33.2
    },
    {
    "x": 1733050800000,
    "y": 33.25
    },
    {
    "x": 1733054400000,
    "y": 33.78
    },
    {
    "x": 1733058000000,
    "y": 32.52
    },
    {
    "x": 1733061600000,
    "y": 32.44
    },
    {
    "x": 1733065200000,
    "y": 33.37
    },
    {
    "x": 1733068800000,
    "y": 29.65
    },
    {
    "x": 1733072400000,
    "y": 23.93
    },
    {
    "x": 1733076000000,
    "y": 19.21
    },
    {
    "x": 1733079600000,
    "y": 16.07
    },
    {
    "x": 1733083200000,
    "y": 13.58
    },
    {
    "x": 1733086800000,
    "y": 13.22
    },
    {
    "x": 1733090400000,
    "y": 14.91
    },
    {
    "x": 1733094000000,
    "y": 20.34
    },
    {
    "x": 1733097600000,
    "y": 30.27
    },
    {
    "x": 1733101200000,
    "y": 39.14
    },
    {
    "x": 1733104800000,
    "y": 39.46
    },
    {
    "x": 1733108400000,
    "y": 41.45
    },
    {
    "x": 1733112000000,
    "y": 45.19
    },
    {
    "x": 1733115600000,
    "y": 46.78
    },
    {
    "x": 1733119200000,
    "y": 48.32
    },
    {
    "x": 1733122800000,
    "y": 44.51
    },
    {
    "x": 1733126400000,
    "y": 40.96
    },
    {
    "x": 1733130000000,
    "y": 37.96
    },
    {
    "x": 1733133600000,
    "y": 36.52
    },
    {
    "x": 1733137200000,
    "y": 34.5
    },
    {
    "x": 1733140800000,
    "y": 32.1
    },
    {
    "x": 1733144400000,
    "y": 31.53
    },
    {
    "x": 1733148000000,
    "y": 30.56
    },
    {
    "x": 1733151600000,
    "y": 30.3
    },
    {
    "x": 1733155200000,
    "y": 29.07
    },
    {
    "x": 1733158800000,
    "y": 25.13
    },
    {
    "x": 1733162400000,
    "y": 20.33
    },
    {
    "x": 1733166000000,
    "y": 18
    },
    {
    "x": 1733169600000,
    "y": 16.63
    },
    {
    "x": 1733173200000,
    "y": 15.88
    },
    {
    "x": 1733176800000,
    "y": 17.75
    },
    {
    "x": 1733180400000,
    "y": 21.28
    },
    {
    "x": 1733184000000,
    "y": 25.12
    },
    {
    "x": 1733187600000,
    "y": 29.14
    },
    {
    "x": 1733191200000,
    "y": 32.15
    },
    {
    "x": 1733194800000,
    "y": 35
    },
    {
    "x": 1733198400000,
    "y": 36.83
    },
    {
    "x": 1733202000000,
    "y": 36.71
    },
    {
    "x": 1733205600000,
    "y": 37.14
    },
    {
    "x": 1733209200000,
    "y": 35.15
    },
    {
    "x": 1733212800000,
    "y": 33.73
    },
    {
    "x": 1733216400000,
    "y": 33.98
    },
    {
    "x": 1733220000000,
    "y": 32.03
    },
    {
    "x": 1733223600000,
    "y": 30.47
    },
    {
    "x": 1733227200000,
    "y": 29.71
    },
    {
    "x": 1733230800000,
    "y": 26.66
    },
    {
    "x": 1733234400000,
    "y": 25.61
    },
    {
    "x": 1733238000000,
    "y": 24.77
    },
    {
    "x": 1733241600000,
    "y": 22.16
    },
    {
    "x": 1733245200000,
    "y": 18.67
    },
    {
    "x": 1733248800000,
    "y": 16.14
    },
    {
    "x": 1733252400000,
    "y": 15.72
    },
    {
    "x": 1733256000000,
    "y": 15.3
    },
    {
    "x": 1733259600000,
    "y": 14.89
    },
    {
    "x": 1733263200000,
    "y": 19.43
    },
    {
    "x": 1733266800000,
    "y": 23.98
    },
    {
    "x": 1733270400000,
    "y": 28.52
    },
    {
    "x": 1733274000000,
    "y": 31.09
    }
    ],
    "pressure": [
    {
    "x": 1732842000000,
    "y": 29.98
    },
    {
    "x": 1732845600000,
    "y": 30
    },
    {
    "x": 1732849200000,
    "y": 30
    },
    {
    "x": 1732852800000,
    "y": 30.03
    },
    {
    "x": 1732856400000,
    "y": 30.04
    },
    {
    "x": 1732860000000,
    "y": 30.06
    },
    {
    "x": 1732863600000,
    "y": 30.03
    },
    {
    "x": 1732867200000,
    "y": 30.03
    },
    {
    "x": 1732870800000,
    "y": 30.03
    },
    {
    "x": 1732874400000,
    "y": 30.03
    },
    {
    "x": 1732878000000,
    "y": 30.03
    },
    {
    "x": 1732881600000,
    "y": 30.03
    },
    {
    "x": 1732885200000,
    "y": 30.03
    },
    {
    "x": 1732888800000,
    "y": 30.03
    },
    {
    "x": 1732892400000,
    "y": 30.03
    },
    {
    "x": 1732896000000,
    "y": 30.06
    },
    {
    "x": 1732899600000,
    "y": 30.06
    },
    {
    "x": 1732903200000,
    "y": 30.06
    },
    {
    "x": 1732906800000,
    "y": 30.06
    },
    {
    "x": 1732910400000,
    "y": 30.03
    },
    {
    "x": 1732914000000,
    "y": 30
    },
    {
    "x": 1732917600000,
    "y": 30
    },
    {
    "x": 1732921200000,
    "y": 30
    },
    {
    "x": 1732924800000,
    "y": 30
    },
    {
    "x": 1732928400000,
    "y": 30
    },
    {
    "x": 1732932000000,
    "y": 30
    },
    {
    "x": 1732935600000,
    "y": 30.02
    },
    {
    "x": 1732939200000,
    "y": 30.03
    },
    {
    "x": 1732942800000,
    "y": 30.03
    },
    {
    "x": 1732946400000,
    "y": 30.06
    },
    {
    "x": 1732950000000,
    "y": 30.06
    },
    {
    "x": 1732953600000,
    "y": 30.06
    },
    {
    "x": 1732957200000,
    "y": 30.06
    },
    {
    "x": 1732960800000,
    "y": 30.06
    },
    {
    "x": 1732964400000,
    "y": 30.04
    },
    {
    "x": 1732968000000,
    "y": 30.03
    },
    {
    "x": 1732971600000,
    "y": 30.05
    },
    {
    "x": 1732975200000,
    "y": 30.06
    },
    {
    "x": 1732978800000,
    "y": 30.06
    },
    {
    "x": 1732982400000,
    "y": 30.06
    },
    {
    "x": 1732986000000,
    "y": 30.06
    },
    {
    "x": 1732989600000,
    "y": 30.08
    },
    {
    "x": 1732993200000,
    "y": 30.06
    },
    {
    "x": 1732996800000,
    "y": 30.03
    },
    {
    "x": 1733000400000,
    "y": 30
    },
    {
    "x": 1733004000000,
    "y": 29.99
    },
    {
    "x": 1733007600000,
    "y": 29.99
    },
    {
    "x": 1733011200000,
    "y": 30
    },
    {
    "x": 1733014800000,
    "y": 30.01
    },
    {
    "x": 1733018400000,
    "y": 30.02
    },
    {
    "x": 1733022000000,
    "y": 30.03
    },
    {
    "x": 1733025600000,
    "y": 30.04
    },
    {
    "x": 1733029200000,
    "y": 30.05
    },
    {
    "x": 1733032800000,
    "y": 30.07
    },
    {
    "x": 1733036400000,
    "y": 30.08
    },
    {
    "x": 1733040000000,
    "y": 30.08
    },
    {
    "x": 1733043600000,
    "y": 30.08
    },
    {
    "x": 1733047200000,
    "y": 30.08
    },
    {
    "x": 1733050800000,
    "y": 30.07
    },
    {
    "x": 1733054400000,
    "y": 30.07
    },
    {
    "x": 1733058000000,
    "y": 30.07
    },
    {
    "x": 1733061600000,
    "y": 30.08
    },
    {
    "x": 1733065200000,
    "y": 30.1
    },
    {
    "x": 1733068800000,
    "y": 30.12
    },
    {
    "x": 1733072400000,
    "y": 30.13
    },
    {
    "x": 1733076000000,
    "y": 30.14
    },
    {
    "x": 1733079600000,
    "y": 30.12
    },
    {
    "x": 1733083200000,
    "y": 30.09
    },
    {
    "x": 1733086800000,
    "y": 30.06
    },
    {
    "x": 1733090400000,
    "y": 30.05
    },
    {
    "x": 1733094000000,
    "y": 30.05
    },
    {
    "x": 1733097600000,
    "y": 30.06
    },
    {
    "x": 1733101200000,
    "y": 30.07
    },
    {
    "x": 1733104800000,
    "y": 30.08
    },
    {
    "x": 1733108400000,
    "y": 30.08
    },
    {
    "x": 1733112000000,
    "y": 30.09
    },
    {
    "x": 1733115600000,
    "y": 30.09
    },
    {
    "x": 1733119200000,
    "y": 30.09
    },
    {
    "x": 1733122800000,
    "y": 30.09
    },
    {
    "x": 1733126400000,
    "y": 30.08
    },
    {
    "x": 1733130000000,
    "y": 30.07
    },
    {
    "x": 1733133600000,
    "y": 30.07
    },
    {
    "x": 1733137200000,
    "y": 30.06
    },
    {
    "x": 1733140800000,
    "y": 30.06
    },
    {
    "x": 1733144400000,
    "y": 30.06
    },
    {
    "x": 1733148000000,
    "y": 30.06
    },
    {
    "x": 1733151600000,
    "y": 30.08
    },
    {
    "x": 1733155200000,
    "y": 30.08
    },
    {
    "x": 1733158800000,
    "y": 30.09
    },
    {
    "x": 1733162400000,
    "y": 30.08
    },
    {
    "x": 1733166000000,
    "y": 30.07
    },
    {
    "x": 1733169600000,
    "y": 30.04
    },
    {
    "x": 1733173200000,
    "y": 30.01
    },
    {
    "x": 1733176800000,
    "y": 30
    },
    {
    "x": 1733180400000,
    "y": 30
    },
    {
    "x": 1733184000000,
    "y": 30
    },
    {
    "x": 1733187600000,
    "y": 30.01
    },
    {
    "x": 1733191200000,
    "y": 30.02
    },
    {
    "x": 1733194800000,
    "y": 30.02
    },
    {
    "x": 1733198400000,
    "y": 30.03
    },
    {
    "x": 1733202000000,
    "y": 30.04
    },
    {
    "x": 1733205600000,
    "y": 30.03
    },
    {
    "x": 1733209200000,
    "y": 30.03
    },
    {
    "x": 1733212800000,
    "y": 30.02
    },
    {
    "x": 1733216400000,
    "y": 30.02
    },
    {
    "x": 1733220000000,
    "y": 30.01
    },
    {
    "x": 1733223600000,
    "y": 30
    },
    {
    "x": 1733227200000,
    "y": 30
    },
    {
    "x": 1733230800000,
    "y": 30
    },
    {
    "x": 1733234400000,
    "y": 30.01
    },
    {
    "x": 1733238000000,
    "y": 30.02
    },
    {
    "x": 1733241600000,
    "y": 30.03
    },
    {
    "x": 1733245200000,
    "y": 30.04
    },
    {
    "x": 1733248800000,
    "y": 30.05
    },
    {
    "x": 1733252400000,
    "y": 30.03
    },
    {
    "x": 1733256000000,
    "y": 30.02
    },
    {
    "x": 1733259600000,
    "y": 30
    },
    {
    "x": 1733263200000,
    "y": 30
    },
    {
    "x": 1733266800000,
    "y": 30
    },
    {
    "x": 1733270400000,
    "y": 29.99
    },
    {
    "x": 1733274000000,
    "y": 30.01
    }
    ]
    }
    }