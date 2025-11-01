import Image from "next/image";
import Link from "next/link";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SignupPage() {
  const loginImage = PlaceHolderImages.find(p => p.id === 'login-image');

  return (
    <div className="w-full min-h-screen bg-background">
      <div className="w-full lg:grid lg:min-h-screen lg:grid-cols-2">
         <div className="hidden bg-muted lg:block relative">
          {loginImage && (
            <Image
              src={loginImage.imageUrl}
              alt={loginImage.description}
              fill
              className="object-cover"
              data-ai-hint={loginImage.imageHint}
            />
          )}
        </div>
        <div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-md space-y-6">
            <div className="text-center">
              <UserPlus className="mx-auto h-12 w-12 text-primary" />
              <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl font-headline">
                Create an Account
              </h1>
              <p className="mt-2 text-muted-foreground">
                Join CareHub to streamline your care services.
              </p>
            </div>
            <Card className="shadow-2xl">
              <CardHeader>
                <CardTitle className="text-2xl">Sign Up</CardTitle>
                <CardDescription>
                  Enter your information to create an account
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                 <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="first-name">First name</Label>
                    <Input id="first-name" placeholder="Max" required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="last-name">Last name</Label>
                    <Input id="last-name" placeholder="Robinson" required />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" />
                </div>
                 <div className="grid gap-2">
                  <Label htmlFor="role">Role</Label>
                    <Select>
                        <SelectTrigger id="role">
                            <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="caregiver">Caregiver</SelectItem>
                            <SelectItem value="parent">Parent</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Button type="submit" className="w-full" asChild>
                    <Link href="/dashboard">Create an account</Link>
                </Button>
              </CardContent>
            </Card>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link href="/" className="underline">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
