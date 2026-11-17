"use client";

import { useEffect, useState } from "react";
import { useLocations } from "@/hooks/use-locations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, AlertTriangle, CheckCircle } from "lucide-react";

interface EVVMapProps {
  caregiverId: string;
}

export default function EVVMap({ caregiverId }: EVVMapProps) {
  const { locations, loading } = useLocations();
  const [currentLocation, setCurrentLocation] = useState<any>(null);

  useEffect(() => {
    if (locations.length > 0) {
      const caregiverLocation = locations.find(loc => loc.caregiverId === caregiverId);
      setCurrentLocation(caregiverLocation);
    }
  }, [locations, caregiverId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            EVV Location Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-muted rounded-lg flex items-center justify-center">
            <p className="text-muted-foreground">Loading location data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          EVV Location Tracking
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Map Placeholder */}
          <div className="h-64 bg-muted rounded-lg flex items-center justify-center relative">
            <div className="text-center">
              <MapPin className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">Interactive Map Integration</p>
              <p className="text-xs text-muted-foreground mt-1">
                Map component would be integrated here (e.g., Google Maps, Mapbox)
              </p>
            </div>

            {/* Current Location Indicator */}
            {currentLocation && (
              <div className="absolute top-4 right-4">
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  On Location
                </Badge>
              </div>
            )}
          </div>

          {/* Location Details */}
          {currentLocation ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium">Current Location</p>
                <p className="text-muted-foreground">
                  {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
                </p>
              </div>
              <div>
                <p className="font-medium">Last Updated</p>
                <p className="text-muted-foreground">
                  {new Date(currentLocation.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-orange-500" />
              <p className="text-muted-foreground">No location data available</p>
            </div>
          )}

          {/* Compliance Status */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">EVV Compliance</span>
            </div>
            <Badge variant="default" className="bg-green-500">
              Compliant
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
