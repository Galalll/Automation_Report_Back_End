import expressAsyncHandler from "express-async-handler";
import os from 'os';
import axios from "axios";
import * as turf from "@turf/turf";
import proj4 from "proj4";
import dotenv from "dotenv";
import path from "path";
import fs from "fs-extra";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { captureMapWithLeaflet } from './puppeteerCapture.mjs';
import { downloadImageToFile } from './downloadImageToFile.mjs';
dotenv.config();
const AGOL_Token = process.env.AGOLToken;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Define CRSs for proj4
proj4.defs(
    "EPSG:3857",
    "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs"
);
proj4.defs(
    "EPSG:2193",
    "+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs"
);
proj4.defs("EPSG:4167", "+proj=longlat +ellps=GRS80 +no_defs +type=crs");
proj4.defs("EPSG:4326","+proj=longlat +datum=WGS84 +no_defs +type=crs");
/**
 * Main export-report handler
 */
const Export_Report = expressAsyncHandler(async (req, res) => {
    const authenticated = await req.authenticated;
    const user = req.user;
    const { response, input } = req.body;
    if (!authenticated) {
        return res.status(401).json({ message: "You are not authenticated." });
    }

    const feature = response.features?.[0];
    if (!feature?.geometry) {
        return res.status(400).json({ message: "All fields are required!" });
    }

    const geometry = feature.geometry;
    const properties = feature.properties;

    // Build report content
    const Report_Content = {
        search_input: input,
        properties,
        result: await Query_Services(geometry),
    };
    let buf = await Report_Creation(user, Report_Content,geometry)

    res.status(200).set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename=Generated_Report.docx',
    }).send(buf);
});

export { Export_Report };

/**
 * Queries various ArcGIS/WFS services based on GeoJSON bbox.
 */
async function Query_Services(geometry) {
    const [minLon, minLat, maxLon, maxLat] = turf.bbox(geometry);
    const Location =await CheckOutCouncilsBorders(minLon,minLat,maxLon,maxLat)
    return {
        Coastal_Hazard_Line: await Query_Coastal_Hazard_Line_Service(minLon,minLat,maxLon,maxLat,Location),
        Coastline_Most_Prone_To_Erosion: await Query_Coastline_Most_Prone_To_Erosion_Service(minLon,minLat,maxLon,maxLat,Location),
        Sea_Level_Rise_Storm: await Query_Sea_Level_Rise_Storm_Service(minLon,minLat,maxLon,maxLat,Location),
        Active_Faults: await Query_Active_Faults_Service(minLon,minLat,maxLon,maxLat),
        Shaking_Amplification: await Query_Shaking_Amplification_Service(minLon,minLat,maxLon,maxLat),
        Liquefaction_Risk: await Query_Liquefaction_Risk_Service(minLon,minLat,maxLon,maxLat,Location),
        Invercargill_Liquefaction_Risk: await Query_Invercargill_Liquefaction_risk(minLon,minLat,maxLon,maxLat,Location),
        Tsunami_Landslide: await Query_Tsunami_Landslide_Service(minLon,minLat,maxLon,maxLat,Location),
        Landslides: await Query_LandSlides_WFS_Service(minLon,minLat,maxLon,maxLat),
        Tsunami_Evacuation_Zones: await Query_Tsunami_Evacuation_Zones_Service(minLon,minLat,maxLon,maxLat,Location),
        Stewart_Island_Land_Use: await Query_Stewart_Island_Land_Use_Service(minLon,minLat,maxLon,maxLat,Location),
        Actual_and_Potential_Floodplain: await Query_Actual_and_Potential_Floodplain_Service(minLon,minLat,maxLon,maxLat),
        Historical_Flood_Photographs:await Query_Historical_Flood_Photographs_Service(minLon,minLat,maxLon,maxLat),
        District_Inundation: await Query_District_Inundation_Service(minLon,minLat,maxLon,maxLat,Location),
        Riverine_Inundation: await Query_Riverine_Inundation_Service(minLon,minLat,maxLon,maxLat,Location)
    };
}

async function Report_Creation(User, Report_Content, geometry) {
    let AddHistory = {};
    AddHistory.UserEmail = User.user.Email;
    AddHistory.UserName = `${User.user.FirstName} ${User.user.LastName}`;
    AddHistory.Search_Date = Date.now();
    AddHistory.Property_Address = Report_Content.properties.appellation;
    AddHistory.Legal_Description = Report_Content.search_input.Legal_Description;
    AddHistory.Territorial_Authority =
        Report_Content.search_input.Territorial_Authority;
    AddHistory.LIM_Reference_Num =
        Report_Content.search_input.LIM_Reference_Number;
    AddHistory.Land_District = Report_Content.properties.land_district;
    await SaveQueryHistory(AddHistory);
    try {

        // const apiToken = process.env.LINZ_API_TOKEN;  // set your token in env
        const myGeoJSON = { type: "Feature", geometry };
        const centerPt = turf.centroid(myGeoJSON);
        const [lon, lat] = centerPt.geometry.coordinates;

        const imgBuffer = await captureMapWithLeaflet({
            geojson: myGeoJSON,
            center: [lon, lat],
            zoom: 15,
            width: 1200,
            height: 800,
        });

        const tmpImagePath = path.join(os.tmpdir(), 'map.png');
        fs.writeFileSync(tmpImagePath, imgBuffer);

        let localPhotoPath;
        if (Report_Content.result.Historical_Flood_Photographs) {
            localPhotoPath = await downloadImageToFile(Report_Content.result.Historical_Flood_Photographs);
        } else {
            localPhotoPath = null;
        }

        // Read the Word template (Report 1.docx) as binary
        const templatePath = path.resolve(__dirname, "../templates", "Report_v2.docx");

        const content = fs.readFileSync(templatePath, "binary");

        // Load the template into PizZip & Docxtemplater
        const zip = new PizZip(content);

        // 2c) Configure the image module
        const imageModule = new ImageModule({
            getImage: (tagValue) => {
                // tagValue will be the path we pass in below:
                return fs.readFileSync(tagValue);
            },
            getSize: (img, tagValue) => {
                // you control document‐pixel size here:
                return [600, 400];
            }
        });

        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            modules: [imageModule],
        });
        const today = new Date();
        const formattedDate = today.toLocaleDateString();
        // Set the template variables
        doc.render({
            propertyAddress: Report_Content.properties.appellation,
            legalDescription: Report_Content.search_input.Legal_Description,
            territorialAuthority: Report_Content.search_input.Territorial_Authority,
            limReferenceNumber: Report_Content.search_input.LIM_Reference_Number,
            date: formattedDate,
            CoastalHazardLine: Report_Content.result.Coastal_Hazard_Line ? Report_Content.result.Coastal_Hazard_Line : 'No response',
            CoaslineMostProne: Report_Content.result.Coastline_Most_Prone_To_Erosion ? Report_Content.result.Coastline_Most_Prone_To_Erosion : 'No response',
            SeaLevelRise: Report_Content.result.Sea_Level_Rise_Storm ? Report_Content.result.Sea_Level_Rise_Storm : 'No response',
            ActiveFaultDatabase: Report_Content.result.Active_Faults ? Report_Content.result.Active_Faults : 'No response',
            SouthlandGroundShaking: Report_Content.result.Shaking_Amplification ? Report_Content.result.Shaking_Amplification : 'Tsunami  modelling in Southland is still being undertaken and is subject to change. If you are concerned, near a waterbody and there is a long or strong earthquake, evacuate the area immediately. Do not wait for official warnings.',
            SouthlandLiquefactionRisk: Report_Content.result.Liquefaction_Risk ? Report_Content.result.Liquefaction_Risk : 'No response',
            InvercargillLiquefactionRisk: Report_Content.result.Invercargill_Liquefaction_Risk ? Report_Content.result.Invercargill_Liquefaction_Risk : 'No response',
            TsunamiEvacuationZones: Report_Content.result.Tsunami_Evacuation_Zones ? Report_Content.result.Tsunami_Evacuation_Zones : 'No response',
            NationalTsunamiHazard: Report_Content.result.Tsunami_Landslide ? Report_Content.result.Tsunami_Landslide : 'No response',
            ActualandPotentialFloodplain: Report_Content.result.Actual_and_Potential_Floodplain ? Report_Content.result.Actual_and_Potential_Floodplain : 'No response',
            RiverineInundation: Report_Content.result.Riverine_Inundation ? Report_Content.result.Riverine_Inundation : 'No response',
            GNSLandslideDatabase: Report_Content.result.Landslides ? Report_Content.result.Landslides : 'No response',
            StewartIslandLandUse: Report_Content.result.Stewart_Island_Land_Use ? Report_Content.result.Stewart_Island_Land_Use : 'No response',
            propertyboundary: tmpImagePath,
            floodphotographs: localPhotoPath
        });
        // Render the document (replace all tags)

        // Generate the document buffer
        const buf = doc.getZip().generate({ type: "nodebuffer" });
        if (tmpImagePath) {
            fs.unlinkSync(tmpImagePath);
        }
        if (localPhotoPath) {
            fs.unlinkSync(localPhotoPath);
        }
        return buf;
    } catch (error) {
        console.error("Error generating report:", error);
    }
}

export async function SaveQueryHistory(attributes) {
  const url = `https://services-ap1.arcgis.com/ZXhVeRvWZGPvtP2i/ArcGIS/rest/services/Automated_Reporting_Tables/FeatureServer/1/applyEdits`;
  const adds = [{ attributes }];
  const bodyParams = new URLSearchParams({
    adds: JSON.stringify(adds),
    f: 'json',
    token: AGOL_Token,
  }).toString();

  // Create an axios instance with timeout
  const client = axios.create({
    timeout: 10_000, // abort if no response in 10s
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data } = await client.post(url, bodyParams);
      // Check for ArcGIS REST errors
      if (data.error) {
        throw new Error(`AGOL error: ${data.error.code} ${data.error.message}`);
      }
      const addResult = data.addResults?.[0];
      if (addResult?.error) {
        throw new Error(
          `Feature add failed: ${addResult.error.code} ${addResult.error.description}`
        );
      }
      return data;
    } catch (err) {
      lastError = err;
      console.warn(
        `SaveQueryHistory attempt #${attempt} failed:`,
        err.code === 'ECONNABORTED' ? 'timeout' : err.message
      );
      if (attempt < 2) {
        // back off 1 second before retry
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // Both attempts failed
  throw lastError;
}

//////Coastal Hazard Information//////
// Coastal Hazard Line
async function Query_Coastal_Hazard_Line_Service(
    minLon,
    minLat,
    maxLon,
    maxLat,
    Location
) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:3857", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:3857", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;
    if (Location == "Southland District") {
        const url =
            "https://services3.arcgis.com/v5RzLI7nHYeFImL4/ArcGIS/rest/services/Coastal_Hazard_Line/FeatureServer/0/query";
        const params = {
            where: "1=1",
            geometry: envelope,
            geometryType: "esriGeometryEnvelope",
            inSR: 3857,
            spatialRel: "esriSpatialRelIntersects",
            outFields: "Feature_Ty",
            returnGeometry: false,
            f: "json",
        };

        // 4) Fire off the request and handle errors
        let resp;
        try {
            resp = await axios.get(url, { params, timeout: 120_000 });
            if (resp.data.error) {
                throw new Error(
                    `Service error ${resp.data.error.code}: ${resp.data.error.message}`
                );
            }
        } catch (err) {
            console.error("ArcGIS query failed:", err.message);

            if (err.response?.status === 504) {
                const msg =
                    "The ArcGIS service timed out. Try reducing the envelope size or " +
                    "contact the service owner to increase the timeout.";
                return { error: { code: 504, message: msg, details: [] } };
            }
            throw err;
        }

        // 5) Return just the features array
        if (resp.data.features.length > 0) {
            return 'This property is deemed to be prone to coastal hazards. In Southland, any land between the Coastal Hazard Line (identified in this property) and the coast is at risk from coastal hazards. These could include: Sea level rise, tsunami, storm surges, and coastal erosion and inundation, while special provisions under the Southland District Plan apply to limit the use of this land.';
        } else {
            return false;
        }
    } else {
        return false;
    }
}

//Coasline Most Prone to Erosion
async function Query_Coastline_Most_Prone_To_Erosion_Service(
    minLon,
    minLat,
    maxLon,
    maxLat,
    Location
) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;
    if (Location == "Invercargill City") {
        const url =
            "https://services-ap1.arcgis.com/ZXhVeRvWZGPvtP2i/ArcGIS/rest/services/DistrictPlan/FeatureServer/0/query";
        const params = {
            where: "1=1",
            geometry: envelope,
            geometryType: "esriGeometryEnvelope",
            inSR: 2193,
            spatialRel: "esriSpatialRelIntersects",
            outFields: "PROPOSED",
            returnGeometry: false,
            f: "json",
            token: AGOL_Token,
        };

        // 4) Fire off the request and handle errors
        let resp;
        try {
            resp = await axios.get(url, { params, timeout: 120_000 });

            if (resp.data.error) {
                throw new Error(
                    `Service error ${resp.data.error.code}: ${resp.data.error.message}`
                );
            }
        } catch (err) {
            console.error("ArcGIS query failed:", err.message);
            if (err.response?.status === 504) {
                const msg =
                    "The ArcGIS service timed out. Try reducing the envelope size or " +
                    "contact the service owner to increase the timeout.";
                return { error: { code: 504, message: msg, details: [] } };
            }
            throw err;
        }
        // 5) Return just the features array
        if (resp.data.features.length > 0) {
            return 'This property is deemed to be prone to coastal hazards. In Invercargill, any land between the Coasline Most Prone to Erosion and the coast is at risk from coastal hazards, while special provisions under the Invercargill City Plan apply to limit the use of this land.';
        } else {
            return "No response.";
        }
    } else {
        return "No response.";
    }
}

//Sea Level Rise Storm Surge Event
async function Query_Sea_Level_Rise_Storm_Service(
    minLon,
    minLat,
    maxLon,
    maxLat,
    Location
) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;
    if (Location == "Invercargill City") {
        const url =
        "https://services-ap1.arcgis.com/ZXhVeRvWZGPvtP2i/ArcGIS/rest/services/DistrictPlan/FeatureServer/1/query";
    const params = {
        where: "1=1",
        geometry: envelope,
        geometryType: "esriGeometryEnvelope",
        inSR: 2193,
        spatialRel: "esriSpatialRelIntersects",
        outFields: "RISK_LEVEL",
        returnGeometry: false,
        f: "json",
        token: AGOL_Token,
    };

    let resp;
    try {
        resp = await axios.get(url, { params, timeout: 120_000 });

        if (resp.data.error) {
            throw new Error(
                `Service error ${resp.data.error.code}: ${resp.data.error.message}`
            );
        }
    } catch (err) {
        console.error("ArcGIS query failed:", err.message);
        if (err.response?.status === 504) {
            const msg =
                "The ArcGIS service timed out. Try reducing the envelope size or " +
                "contact the service owner to increase the timeout.";
            return { error: { code: 504, message: msg, details: [] } };
        }
        throw err;
    }
    if (resp.data.features.length > 0) {
        return 'This property is deemed to be prone to coastal hazards. This property is deemed to be in an estuary area, that are less than three metres above mean sea level and most at risk from sea level rise/storm surge event.  As it at risk from coastal hazards, while special provisions under the Invercargill City Plan apply to limit the use of this land.';
    } else {
        return false;
    }
    }else{
        return false;
    }
}

//////Earthquake//////
//NZ Active Faults Database
async function Query_Active_Faults_Service(minLon, minLat, maxLon, maxLat) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;

    // 3) Build your query
    const url =
        "https://gis.gns.cri.nz/server/rest/services/Active_Faults/NZActiveFaultDatasets/MapServer/0/query";
    const params = {
        where: "1=1",
        geometry: envelope,
        geometryType: "esriGeometryEnvelope",
        inSR: 2193,
        spatialRel: "esriSpatialRelIntersects",
        outFields: "acc,rec_interval,last_event",
        returnGeometry: false,
        f: "json",
    };

    // 4) Fire off the request and handle errors
    let resp;
    try {
        resp = await axios.get(url, { params, timeout: 120_000 });
        if (resp.data.error) {
            throw new Error(
                `Service error ${resp.data.error.code}: ${resp.data.error.message}`
            );
        }
    } catch (err) {
        console.error("ArcGIS query failed:", err.message);
        if (err.response?.status === 504) {
            const msg =
                "The ArcGIS service timed out. Try reducing the envelope size or " +
                "contact the service owner to increase the timeout.";
            return { error: { code: 504, message: msg, details: [] } };
        }
        throw err;
    }
    // 5) Return just the features array
    if (resp.data.features.length > 0) {
        return `The property contains an Active Fault, as identified by GNS Science. This fault is mapped to the with the following accuracy: ${resp.data.features[0]?.attributes.acc}, with a reoccurance interval of ${resp.data.features[0]?.attributes.rec_interval} and a last known failure of: ${resp.data.features[0]?.attributes.last_event}. Further information and the complete database is available from GNS Science: https://www.gns.cri.nz/data-and-resources/new-zealand-active-faults-database/`;
    } else {
        return false;
    }
}

//Southland Ground Shaking Amplification Risk
async function Query_Shaking_Amplification_Service(
    minLon,
    minLat,
    maxLon,
    maxLat
) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;

    // 3) Build your query
    const url =
        "https://maps.es.govt.nz/server/rest/services/Public/NaturalHazards/MapServer/10/query";
    const params = {
        where: "1=1",
        geometry: envelope,
        geometryType: "esriGeometryEnvelope",
        inSR: 2193,
        spatialRel: "esriSpatialRelIntersects",
        outFields: "AMP_CODE",
        returnGeometry: false,
        f: "json",
    };

    // 4) Fire off the request and handle errors
    let resp;
    try {
        resp = await axios.get(url, { params, timeout: 120_000 });
        if (resp.data.error) {
            throw new Error(
                `Service error ${resp.data.error.code}: ${resp.data.error.message}`
            );
        }
    } catch (err) {
        console.error("ArcGIS query failed:", err.message);
        if (err.response?.status === 504) {
            const msg =
                "The ArcGIS service timed out. Try reducing the envelope size or " +
                "contact the service owner to increase the timeout.";
            return { error: { code: 504, message: msg, details: [] } };
        }
        throw err;
    }
    // 5) Return just the features array
    if (resp.data.features.length > 0) {
        return 'The property contains an area mapped as prone to Tsunami where evacuation will be required. Do not wait for official warnings, if there is a long or strong earthquake evacuate the area immediately. Note that not all tsunami modelling has been completed for Southland and this advice is subject to change.';
    } else {
        return false;
    }
}

//Southland Liquefaction risk
async function Query_Liquefaction_Risk_Service(minLon, minLat, maxLon, maxLat,Location) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;
    if (Location == "Southland District" || Location == "Gore District") {
        const url =
            "https://maps.es.govt.nz/server/rest/services/Public/NaturalHazards/MapServer/11/query";
        const params = {
            where: "1=1",
            geometry: envelope,
            geometryType: "esriGeometryEnvelope",
            inSR: 2193,
            spatialRel: "esriSpatialRelIntersects",
            outFields: "LIQ_RISK",
            returnGeometry: false,
            f: "json",
        };

        // 4) Fire off the request and handle errors
        let resp;
        try {
            resp = await axios.get(url, { params, timeout: 120_000 });
            if (resp.data.error) {
                throw new Error(
                    `Service error ${resp.data.error.code}: ${resp.data.error.message}`
                );
            }
        } catch (err) {
            console.error("ArcGIS query failed:", err.message);
            if (err.response?.status === 504) {
                const msg =
                    "The ArcGIS service timed out. Try reducing the envelope size or " +
                    "contact the service owner to increase the timeout.";
                return { error: { code: 504, message: msg, details: [] } };
            }
            throw err;
        }
        // 5) Return just the features array
        if (resp.data.features.length = 1) {
            return `The liquefaction risk for the property is described as: ${resp.data.features[0]?.attributes.LIQ_RISK}. This classification is indicative only and is no substitute for detailed site investigations, including subsurface investigations, to determine ground conditions.`;
        }else if (resp.data.features.length > 1) {
            return `The liquefaction risk for the property differs across the property, and is described as the following risk classes: ${resp.data.features[0]?.attributes.LIQ_RISK}. This classification is indicative only and is no substitute for detailed site investigations, including subsurface investigations, to determine ground conditions.`;
        }else {
            return false;
        }
    } else {
        return false;
    }
}

//Invercargill Liquefaction risk
async function Query_Invercargill_Liquefaction_risk(minLon, minLat, maxLon, maxLat,Location) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;
    if (Location == "Invercargill City") {
        const url =
            "https://services-ap1.arcgis.com/ZXhVeRvWZGPvtP2i/ArcGIS/rest/services/Invercargill_Liquefaction_risk/FeatureServer/0/query";
        const params = {
            where: "1=1",
            geometry: envelope,
            geometryType: "esriGeometryEnvelope",
            inSR: 2193,
            spatialRel: "esriSpatialRelIntersects",
            outFields: "LIQ_CAT",
            returnGeometry: false,
            f: "json",
            token: AGOL_Token
        };

        // 4) Fire off the request and handle errors
        let resp;
        try {
            resp = await axios.get(url, { params, timeout: 120_000 });
            if (resp.data.error) {
                throw new Error(
                    `Service error ${resp.data.error.code}: ${resp.data.error.message}`
                );
            }
        } catch (err) {
            console.error("ArcGIS query failed:", err.message);
            if (err.response?.status === 504) {
                const msg =
                    "The ArcGIS service timed out. Try reducing the envelope size or " +
                    "contact the service owner to increase the timeout.";
                return { error: { code: 504, message: msg, details: [] } };
            }
            throw err;
        }
        // 5) Return just the features array
        if (resp.data.features.length = 1) {
            return `The liquefaction risk for the property is described as: ${resp.data.features[0]?.attributes.LIQ_CAT}. This classification is indicative only and is no substitute for detailed site investigations, including subsurface investigations, to determine ground conditions.`;
        }else if (resp.data.features.length > 1) {
            return `The liquefaction risk for the property differs across the property, and is described as the following risk classes: ${resp.data.features[0]?.attributes.LIQ_CAT}. This classification is indicative only and is no substitute for detailed site investigations, including subsurface investigations, to determine ground conditions.`;
        }else {
            return false;
        }
    } else {
        return false;
    }
}

//////Tsunami and Landslide//////
//National Tsunami Hazard Model
async function Query_Tsunami_Landslide_Service(minLon, minLat, maxLon, maxLat,Location) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:3857", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:3857", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;
    if (Location == "Southland District" || Location == "Invercargill City") {
        const url =
        "https://services3.arcgis.com/v5RzLI7nHYeFImL4/arcgis/rest/services/TsunamiZones2021/FeatureServer/0/query";
    const params = {
        where: "1=1",
        geometry: envelope,
        geometryType: "esriGeometryEnvelope",
        inSR: 3857,
        spatialRel: "esriSpatialRelIntersects",
        outFields: "H100y84p,H500y84p,H1000y84p,H2500y84p",
        returnGeometry: false,
        f: "json",
    };

    // 4) Fire off the request and handle errors
    let resp;
    try {
        resp = await axios.get(url, { params, timeout: 120_000 });
        if (resp.data.error) {
            throw new Error(
                `Service error ${resp.data.error.code}: ${resp.data.error.message}`
            );
        }
    } catch (err) {
        console.error("ArcGIS query failed:", err.message);
        if (err.response?.status === 504) {
            const msg =
                "The ArcGIS service timed out. Try reducing the envelope size or " +
                "contact the service owner to increase the timeout.";
            return { error: { code: 504, message: msg, details: [] } };
        }
        throw err;
    }
    // 5) Return just the features array
    if (resp.data.features.length === 1) {
            return `The National Tsunami Hazard Model estimates the maximum height that tsunami waves could reach, on average, once every 100, 500, 1000, or 2500 years. It provides two levels of confidence: a mid-range estimate (50th percentile) and a higher estimate (84th percentile) to account for more uncertainty. At the 84th percentile, the maximum height, for this section of coast is ${resp.data.features[0]?.attributes.H100y84p}m every 100 years, ${resp.data.features[0]?.attributes.H500y84p}m every 500 years, ${resp.data.features[0]?.attributes.H1000y84p}m every 1000 years and ${resp.data.features[0]?.attributes.H2500y84p}m every 2500 years.`;
        }else if (resp.data.features.length > 1) {
            return `The National Tsunami Hazard Model estimates the maximum height that tsunami waves could reach, on average, once every 100, 500, 1000, or 2500 years. It provides two levels of confidence: a mid-range estimate (50th percentile) and a higher estimate (84th percentile) to account for more uncertainty. At the 84th percentile, the maximum height, for this section of coast is ${resp.data.features[0]?.attributes.H100y84p}m every 100 years, ${resp.data.features[0]?.attributes.H500y84p}m every 500 years, ${resp.data.features[0]?.attributes.H1000y84p}m every 1000 years and ${resp.data.features[0]?.attributes.H2500y84p}m every 2500 years.`;
        }else {
            return false;
        }
    }else{
        return false;
    }
}

//GNS Landslide Database
async function Query_LandSlides_WFS_Service(minLon, minLat, maxLon, maxLat) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:4326", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:4326", [maxLon, maxLat]);
    const wfsUrl = "https://data.gns.cri.nz/webmaps/gns/wfs";
    // common WFS params
    const baseParams = {
        service: "WFS",
        version: "1.0.0",
        request: "GetFeature",
        outputFormat: "application/json",
        bbox: `${xmin},${ymin},${xmax},${ymax}`, // SRS EPSG:4326
    };

    // two layer requests in parallel
    const req1 = axios.get(wfsUrl, {
        params: {
            ...baseParams,
            typeName: "gns:landslide_polygon_feature_view",
        },
        timeout: 20000, // 20s timeout; adjust as needed
    });
    const req2 = axios.get(wfsUrl, {
        params: {
            ...baseParams,
            typeName: "gns:v_landslide3",
        },
        timeout: 20000,
    });

    try {
        const [r1, r2] = await Promise.all([req1, req2]);
        // extract and map to only the fields you care about
        //let LandSlide_Polygon, LandSlide_Point;
        if (r1.data.features.length > 0) {
             return `GNS Science (GNS) has a record(s) of a or multiple landslides on the property. Further information is available from GNS Science - link`
            //LandSlide_Polygon =(r1.data.features || []).map((f) => ({"Landslide feature": f.properties["Landslide feature"] ?? null,"Landslide name": f.properties["Landslide name"] ?? null,}));
        } else {
            return false;//"No GNS Landslide polygon found";
        }

        // if (r2.data.features.length > 0) {
        //     LandSlide_Point = (r2.data.features || []).map((f) => ({
        //         damage_description: f.properties["damage_description"] ?? null,
        //         name: f.properties["name"] ?? null,
        //     }));
        // } else {
        //     LandSlide_Point = false;//"No GNS Landslide Point found";
        // }

        //return { LandSlide_Polygon, LandSlide_Point };
    } catch (err) {
        // timeout
        if (err.code === "ECONNABORTED" || err.response?.status === 504) {
            return {
                error: {
                    code: 504,
                    message:
                        "WFS service timed out. Try reducing the envelope size or contact the service owner to increase the timeout.",
                    details: [],
                },
            };
        }
        // re‐throw any other error
        throw err;
    }
}

//Tsunami Evacuation Zones
async function Query_Tsunami_Evacuation_Zones_Service(
    minLon,
    minLat,
    maxLon,
    maxLat,
    Location
) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;
    if (Location == "Southland District" || Location == "Invercargill City") {
        const url =
            "https://maps.es.govt.nz/server/rest/services/Public/NaturalHazards/MapServer/8/query";
        const params = {
            where: "1=1",
            geometry: envelope,
            geometryType: "esriGeometryEnvelope",
            inSR: 2193,
            spatialRel: "esriSpatialRelIntersects",
            outFields: "Type,Zone,ZoneText",
            returnGeometry: false,
            f: "json",
        };

        let resp;
        try {
            resp = await axios.get(url, { params, timeout: 120_000 });
            if (resp.data.error) {
                throw new Error(
                    `Service error ${resp.data.error.code}: ${resp.data.error.message}`
                );
            }
        } catch (err) {
            console.error("ArcGIS query failed:", err.message);
            if (err.response?.status === 504) {
                const msg =
                    "The ArcGIS service timed out. Try reducing the envelope size or " +
                    "contact the service owner to increase the timeout.";
                return { error: { code: 504, message: msg, details: [] } };
            }
            throw err;
        }
        // 5) Return just the features array
        if (resp.data.features.length = 1) {
            return `The property contains an area mapped as prone to Tsunami where evacuation will be required. Do not wait for official warnings, if there is a long or strong earthquake evacuate the area immediately. Note that not all tsunami modelling has been completed for Southland and this advice is subject to change.`;
        }else if (resp.data.features.length > 1) {
            return `Tsunami  modelling in Southland is still being undertaken and is subject to change. If you are concerned, near a waterbody and there is a long or strong earthquake, evacuate the area immediately. Do not wait for official warnings`;
        }else {
            return false;
        }
    } else {
        return false;
    }
    // 3) Build your query

}

//////Subsidence//////
//Stewart Island Land Use Capability Study
async function Query_Stewart_Island_Land_Use_Service(
    minLon,
    minLat,
    maxLon,
    maxLat,
    Location
) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;
    if (Location == "Southland District") {
        const url =
            "https://maps.es.govt.nz/server/rest/services/Public/NaturalHazards/MapServer/9/query";
        const params = {
            where: "1=1",
            geometry: envelope,
            geometryType: "esriGeometryEnvelope",
            inSR: 2193,
            spatialRel: "esriSpatialRelIntersects",
            outFields: "CapabilityClass,CapabilityDetails",
            returnGeometry: false,
            f: "json",
        };

        // 4) Fire off the request and handle errors
        let resp;
        try {
            resp = await axios.get(url, { params, timeout: 120_000 });
            if (resp.data.error) {
                throw new Error(
                    `Service error ${resp.data.error.code}: ${resp.data.error.message}`
                );
            }
        } catch (err) {
            console.error("ArcGIS query failed:", err.message);
            if (err.response?.status === 504) {
                const msg =
                    "The ArcGIS service timed out. Try reducing the envelope size or " +
                    "contact the service owner to increase the timeout.";
                return { error: { code: 504, message: msg, details: [] } };
            }
            throw err;
        }
        // 5) Return just the features array
        if (resp.data.features.length > 0) {
            return `Property contains A or multiple polygon of inundation: ${resp.data.features[0]?.attributes.CapabilityClass}`;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

//////Flooding//////
//Actual and Potential Floodplain
async function Query_Actual_and_Potential_Floodplain_Service(
    minLon,
    minLat,
    maxLon,
    maxLat
) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;

    // 3) Build your query
    const url =
        "https://services3.arcgis.com/v5RzLI7nHYeFImL4/arcgis/rest/services/SignificantFloodplains/FeatureServer/7/query";
    const params = {
        where: "1=1",
        geometry: envelope,
        geometryType: "esriGeometryEnvelope",
        inSR: 2193,
        spatialRel: "esriSpatialRelIntersects",
        outFields: "Region",
        returnGeometry: false,
        f: "json",
    };

    // 4) Fire off the request and handle errors
    let resp;
    try {
        resp = await axios.get(url, { params, timeout: 120_000 });

        if (resp.data.error) {
            throw new Error(
                `Service error ${resp.data.error.code}: ${resp.data.error.message}`
            );
        }
    } catch (err) {
        console.error("ArcGIS query failed:", err.message);
        if (err.response?.status === 504) {
            const msg =
                "The ArcGIS service timed out. Try reducing the envelope size or " +
                "contact the service owner to increase the timeout.";
            return { error: { code: 504, message: msg, details: [] } };
        }
        throw err;
    }
    // 5) Return just the features array
    if (resp.data.features.length > 0) {
        return `The property includes areas mapped as actual and potential floodplains by Environment Southland. Within the floodplain areas, the likelihood of flooding varies considerably depending on the existence and standard of any flood alleviation works and the height of the particular site. The mapped floodplain(s) are: ${resp.data.features[0]?.attributes.Region}.`;
    } else {
        return false;
    }
}

//Historical Flood Photographs
async function Query_Historical_Flood_Photographs_Service(
    minLon,
    minLat,
    maxLon,
    maxLat
) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;

    // 3) Build your query
    const url =
        "https://maps.es.govt.nz/server/rest/services/Public/NaturalHazards/MapServer/4/query";
    const params = {
        where: "1=1",
        geometry: envelope,
        geometryType: "esriGeometryEnvelope",
        inSR: 2193,
        spatialRel: "esriSpatialRelIntersects",
        outFields: "Date,Type,Aspect,URL",
        distance: 200,
        returnGeometry: false,
        f: "json",
    };

    // 4) Fire off the request and handle errors
    let resp;
    try {
        resp = await axios.get(url, { params, timeout: 120_000 });

        if (resp.data.error) {
            throw new Error(
                `Service error ${resp.data.error.code}: ${resp.data.error.message}`
            );
        }
    } catch (err) {
        console.error("ArcGIS query failed:", err.message);
        if (err.response?.status === 504) {
            const msg =
                "The ArcGIS service timed out. Try reducing the envelope size or " +
                "contact the service owner to increase the timeout.";
            return { error: { code: 504, message: msg, details: [] } };
        }
        throw err;
    }

    // 5) Return just the features array
    if (resp.data.features.length > 0) {
        if (resp.data.features[0]?.attributes.URL) {
            let result = Object.assign({}, resp.data.features[0]);
            result.attributes.URL =
                "https://maps.es.govt.nz/apps/natural-hazards/photos" +
                resp.data.features[0]?.attributes.URL;
            return result.attributes.URL;
        }
    } else {
        return false;
    }
}

//Gore District Plan - Natural Hazards Chapter (Flooding) - District Plan Extent
async function Query_District_Inundation_Service(
    minLon,
    minLat,
    maxLon,
    maxLat,Location
) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;
    if (Location == "Gore District") {
        const url =
            "https://services7.arcgis.com/308bMeGCJ1H5zqO0/ArcGIS/rest/services/District_Inundation/FeatureServer/0/query";
        const params = {
            where: "1=1",
            geometry: envelope,
            geometryType: "esriGeometryEnvelope",
            inSR: 2193,
            spatialRel: "esriSpatialRelIntersects",
            outFields: "Area",
            returnGeometry: false,
            f: "json",
        };

        // 4) Fire off the request and handle errors
        let resp;
        try {
            resp = await axios.get(url, { params, timeout: 120_000 });

            if (resp.data.error) {
                throw new Error(
                    `Service error ${resp.data.error.code}: ${resp.data.error.message}`
                );
            }
        } catch (err) {
            console.error("ArcGIS query failed:", err.message);
            if (err.response?.status === 504) {
                const msg =
                    "The ArcGIS service timed out. Try reducing the envelope size or " +
                    "contact the service owner to increase the timeout.";
                return { error: { code: 504, message: msg, details: [] } };
            }
            throw err;
        }
        // 5) Return just the features array
        if (resp.data.features.length > 0) {
            return resp.data.features;
        } else {
            return "No District Inundation found";
        }
    } else {
        return "Parcel is not in Gore District.";
    }
}

//Invercargill District Plan: Riverine Inundation
async function Query_Riverine_Inundation_Service(
    minLon,
    minLat,
    maxLon,
    maxLat,Location
) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;
    if (Location == "Invercargill City") {
        const url =
        "https://services-ap1.arcgis.com/ZXhVeRvWZGPvtP2i/ArcGIS/rest/services/DistrictPlan/FeatureServer/2/query";
    const params = {
        where: "1=1",
        geometry: envelope,
        geometryType: "esriGeometryEnvelope",
        inSR: 2193,
        spatialRel: "esriSpatialRelIntersects",
        outFields: "RISKLVL",
        returnGeometry: false,
        f: "json",
        token: AGOL_Token,
    };

    // 4) Fire off the request and handle errors
    let resp;
    try {
        resp = await axios.get(url, { params, timeout: 120_000 });

        if (resp.data.error) {
            throw new Error(
                `Service error ${resp.data.error.code}: ${resp.data.error.message}`
            );
        }
    } catch (err) {
        console.error("ArcGIS query failed:", err.message);
        if (err.response?.status === 504) {
            const msg =
                "The ArcGIS service timed out. Try reducing the envelope size or " +
                "contact the service owner to increase the timeout.";
            return { error: { code: 504, message: msg, details: [] } };
        }
        throw err;
    }
    // 5) Return just the features array
    if (resp.data.features.length > 0) {
        return `The property is mapped in the Invercargill City Plan as having the potential for riverine inundation. It is classified as: ${resp.data.features[0]?.attributes.RISKLVL}
Area of riverine inundation are divided into three levels:  Level 1 has a low degree of risk, reflecting flood protection mitigation measures. Level 2 has a high degree of risk, and includes those areas where future flood levels can be predicted. Level 2A has a high degree of risk in a flood event greater than the design limits of the flood protection system. Level 3 has a high degree of risk and includes: those areas designed to pond in a flood event; and active floodplain.`;
    } else {
        return false;
    }
    } else {
        return false;
    }  
}

async function CheckOutCouncilsBorders(minLon, minLat, maxLon, maxLat) {
    const [xmin, ymin] = proj4("EPSG:4167", "EPSG:2193", [minLon, minLat]);
    const [xmax, ymax] = proj4("EPSG:4167", "EPSG:2193", [maxLon, maxLat]);
    const ParcelEnvelope = `${xmin},${ymin},${xmax},${ymax}`;
    const CouncilsBordersLayer =
        "https://services-ap1.arcgis.com/ZXhVeRvWZGPvtP2i/arcgis/rest/services/Territorial_Authority_2023/FeatureServer/0/query";
    const params = {
        where: "1=1",
        geometry: ParcelEnvelope,
        geometryType: "esriGeometryEnvelope",
        inSR: 2193,
        spatialRel: "esriSpatialRelIntersects",
        outFields: "TA2023_V_1",
        returnGeometry: false,
        f: "json",
        token: AGOL_Token
    };

    // 4) Fire off the request and handle errors
    let resp;
    try {
        resp = await axios.get(CouncilsBordersLayer, { params, timeout: 120_000 });

        if (resp.data.error) {
            throw new Error(
                `Service error ${resp.data.error.code}: ${resp.data.error.message}`
            );
        }
    } catch (err) {
        console.error("ArcGIS query failed:", err.message);
        if (err.response?.status === 504) {
            const msg =
                "The ArcGIS service timed out. Try reducing the envelope size or " +
                "contact the service owner to increase the timeout.";
            return { error: { code: 504, message: msg, details: [] } };
        }
        throw err;
    }
    // 5) Return just the features array
    if (resp.data.features.length > 0) {
        return resp.data.features[0]?.attributes?.TA2023_V_1; // Council found
    } else {
        return ""; // No Council found
    }
}
