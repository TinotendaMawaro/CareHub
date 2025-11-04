import Image from "next/image";
import Link from "next/link";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlaceHolderImages } from "@/lib/placeholder-images";

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
              <UserPlus className="mx-auto h-12 w-12 text-primary animate-shimmer" />
              <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl font-headline">
                Registration Disabled
              </h1>
              <p className="mt-2 text-muted-foreground">
                Admin accounts can only be created by existing admins through the dashboard.
              </p>
            </div>
            <Card className="shadow-2xl">
              <CardHeader>
                <CardTitle className="text-2xl">Access Restricted</CardTitle>
                <CardDescription>
                  This application is for admin users only. Contact an existing admin to create your account.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Button className="w-full" asChild>
                    <Link href="/">Back to Login</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
