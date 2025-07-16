import expressAsyncHandler from 'express-async-handler';
import nodemailer from "nodemailer";
import axios from 'axios';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config()
let asyncHandler = expressAsyncHandler;
const Gmail_Secure = process.env.GoogleMailPassword;
const Users_Table_URL = process.env.User_Table;
const AGOL_Token = process.env.AGOLToken;

let SendOTP = asyncHandler(async (req, res) => {
  const { Email } = req.body;
  if (!Email) {
    res.status(400).json({ Message: "All Fields Are Required!" });
  }
  let OTP_Code = await Genrate_OTP(Email)
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: "southlandhazard@gmail.com",
      pass: Gmail_Secure,
    },
  });

  const mailOptions = {
    from: '"Do-Not-Reply" <southlandhazard@gmail.com>', // sender address
    to: Email, // list of receivers
    subject: `Your OTP Code`, // Subject line
    text: `

      Hello, Your OTP Code is ${OTP_Code}, Please Note that this code is valid for 5 minutes only.
      If you didn't ask for this, you can ignore this email.
      Thank you.`

  };
  // Send mail with defined transport object
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      res.status(500).json({ Message: "Faild To Send Mail, Please Try Again Later." });
    }
    res.status(201).json({
      Status: true,
      Message: "Email Sent Successfuly, Please Check your Email"
    });
  });
});

let ChangePassword = asyncHandler(async (req, res) => {
  const { Email, OTP, NewPassword } = req.body;
  if (!Email || !OTP || !NewPassword) {
    return res.status(400).json({ message: 'All fields are required!' });
  }
  let queryResult;
  try {
    queryResult = await QueryUsers(Users_Table_URL, `Email = '${Email}' AND OTP = '${OTP}'`);
  } catch (error) {
    console.error('Error querying users:', error);
    return res.status(500).json({ message: 'Error checking existing Email' });
  }
  if (queryResult.features.length === 0) {
    return res.status(404).json({ message: 'Email not found, or OTP Code is incorrect. please try again' });
  } else if (queryResult.features[0].attributes.OTP_Expiration < new Date().getTime()) {
    return res.status(400).json({ message: 'OTP Code is expired, please send another OTP' });
  }
  // Hash the new password
  const saltRounds = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(NewPassword, saltRounds);
  try {
    await SavePassword(Users_Table_URL, { OBJECTID: queryResult.features[0].attributes.OBJECTID, Password: hashedPassword, OTP: null, OTP_Expiration: null });
  } catch (error) {
    console.error('Error updating password:', error);
    return res.status(500).json({ message: 'Error Contact your admin' });
  }

  res.status(201).json({
    Status: true,
    Message: "Password Changed Successfuly, You can now login with your new password"
  });
});


export {
  SendOTP, ChangePassword
};

async function Genrate_OTP(UserEmail) {
  let queryResult;
  try {
    queryResult = await QueryUsers(Users_Table_URL, `Email = '${UserEmail}'`);

  } catch (err) {
    console.error('Error querying users:', err);
    return res.status(500).json({ message: 'Error checking existing Email' });
  }

  const existingUser = queryResult.features?.[0];
  if (!existingUser) {
    return res.status(404).json({ message: 'Email not found, ask your admin to create an account' });
  }
  let OTP_Code = Math.floor(Math.random() * 11111);

  try {
    await SaveOTP(Users_Table_URL, { OBJECTID: existingUser.attributes.OBJECTID, OTP: OTP_Code, OTP_Expiration: new Date().getTime() + 300000 });
  } catch (error) {
    console.error('Error querying users:', err);
    return res.status(500).json({ message: 'Error Svaing OTP Caode' });
  }
  return OTP_Code;
}

async function SaveOTP(layerURL, attributes) {
  const url = `${layerURL}/applyEdits`;
  const updates = [{ attributes }];
  const data = new URLSearchParams({
    updates: JSON.stringify(updates),
    f: 'json',
    token: AGOL_Token
  }).toString();
  const response = await axios.post(url, data, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
}

async function QueryUsers(layerURL, whereClause) {
  const url = `${layerURL}/query`;
  const config = {
    params: {
      where: whereClause,
      outFields: 'Email, OBJECTID,OTP,OTP_Expiration',
      f: 'json',
      token: AGOL_Token
    }
  };
  const response = await axios.get(url, config);
  return response.data;
}

async function SavePassword(layerURL, attributes) {
  const url = `${layerURL}/applyEdits`;
  const updates = [{ attributes }];
  const data = new URLSearchParams({
    updates: JSON.stringify(updates),
    f: 'json',
    token: AGOL_Token
  }).toString();
  const response = await axios.post(url, data, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
}