
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { ApiResponse } from '../utils/apiResponse';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const generateAccessToken = (user: any) => {
  return jwt.sign({
    userId: user.id,
    email: user.email
  },
    process.env.ACCESS_TOKEN_SECRET as string,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY
    }
  );
};

const encryptPassword = async function(password: string) {
  return await bcrypt.hash(password, 10);
};

const isPasswordCorrect = async function(password: string, encryptedPassword: string) {
  return await bcrypt.compare(password, encryptedPassword);
};

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(18),
  name: z.string()
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(18)
});

const updatePasswordSchema = z.object({
  oldPassword: z.string().min(6).max(18),
  newPassword: z.string().min(6).max(18)
});

export const signUp = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  const result = signUpSchema.safeParse(req.body);
  if (!result.success) {
    throw new ApiError({
      statusCode: 411,
      message: "Invalid inputs"
    });
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      email: email
    }
  });
  if (existingUser) {
    throw new ApiError({ statusCode: 409, message: "User already exists" });
  }

  const encryptedPassword = await encryptPassword(password);

  const user = await prisma.user.create({
    data: {
      email: email,
      password: encryptedPassword,
      name: name
    }
  });

  const accessToken = generateAccessToken(user);

  return res.status(200)
    .cookie("accessToken", accessToken)
    .json(
      new ApiResponse({
        statusCode: 200,
        data: { accessToken },
        message: "User registered successfully"
      })
    );
});

export const signIn = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const result = signInSchema.safeParse(req.body);
  if (!result.success) {
    throw new ApiError({
      statusCode: 411,
      message: "Invalid inputs"
    });
  }

  const user = await prisma.user.findFirst({
    where: {
      email: email
    }
  });

  if (!user) {
    throw new ApiError({
      statusCode: 404,
      message: "User does not exist"
    });
  }

  const isPasswordValid = await isPasswordCorrect(password, user.password);

  if (!isPasswordValid) {
    throw new ApiError({
      statusCode: 401,
      message: "Password incorrect"
    });
  }

  const accessToken = generateAccessToken(user);

  return res.status(200)
    .cookie("accessToken", accessToken)
    .json(
      new ApiResponse({
        statusCode: 200,
        data: { accessToken },
        message: "User logged in successfully"
      })
    );
});

export const signOut = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.body;
  await prisma.user.update({
    where: {
      id: userId
    },
    data: {
      refreshToken: undefined
    }
  });

  return res.status(200)
    .clearCookie("accessToken")
    .json(
      new ApiResponse({
        statusCode: 200,
        data: {},
        message: "User logged out"
      })
    );
});

export const updatePassword = asyncHandler(async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body;

  const result = updatePasswordSchema.safeParse(req.body);
  if (!result.success) {
    throw new ApiError({
      statusCode: 411,
      message: "Invalid inputs"
    });
  }

  const userId = req.user.id;

  const user = await prisma.user.findUnique({
    where: {
      id: userId
    }
  });

  if (!user) {
    throw new ApiError({
      statusCode: 404,
      message: "User not found"
    });
  }

  const isOldPasswordValid = await isPasswordCorrect(oldPassword, user.password);

  if (!isOldPasswordValid) {
    throw new ApiError({
      statusCode: 401,
      message: "Old password is incorrect"
    });
  }

  const encryptedNewPassword = await encryptPassword(newPassword);

  await prisma.user.update({
    where: {
      id: userId
    },
    data: {
      password: encryptedNewPassword
    }
  });

  return res.status(200).json(
    new ApiResponse({
      statusCode: 200,
      data: {},
      message: "Password updated successfully"
    })
  );
});

