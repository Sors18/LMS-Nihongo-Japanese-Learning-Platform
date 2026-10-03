import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function clearCookie(res: NextResponse) {
  res.cookies.set("lms_token", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export async function POST(request: Request) {
  const url = new URL("/", request.url);
  const res = NextResponse.redirect(url, { status: 303 });
  return clearCookie(res);
}

export async function GET(request: Request) {
  const url = new URL("/", request.url);
  const res = NextResponse.redirect(url, { status: 303 });
  return clearCookie(res);
}
