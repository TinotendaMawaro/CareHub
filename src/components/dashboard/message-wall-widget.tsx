"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import type { WallPost } from "@/lib/types";

interface MessageWallWidgetProps {
  posts: WallPost[];
}

export function MessageWallWidget({ posts }: MessageWallWidgetProps) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Message Wall
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {posts.length === 0 && (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          )}
          {posts.map((post) => (
            <div
              key={post.id}
              className="flex items-start gap-3 text-sm"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  {post.authorName?.charAt(0) || "A"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{post.authorName}</span>
                  <Badge
                    variant={
                      post.priority === "urgent"
                        ? "destructive"
                        : post.priority === "important"
                        ? "default"
                        : "secondary"
                    }
                    className="text-xs"
                  >
                    {post.priority}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1">
                  {post.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
