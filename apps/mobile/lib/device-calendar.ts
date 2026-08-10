import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

export async function addToCalendar(event: {
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
}) {
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (!permission.granted) throw new Error("Permissão de calendário negada.");
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  let calendarId = calendars.find((item) => item.allowsModifications)?.id;
  if (!calendarId && Platform.OS === "android") {
    calendarId = await Calendar.createCalendarAsync({
      title: "Prumo",
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: calendars[0]?.source?.id,
      source: calendars[0]?.source,
      name: "Prumo",
      ownerAccount: "personal",
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
      color: "#145C52",
    });
  }
  if (!calendarId) throw new Error("Nenhum calendário editável encontrado.");
  return Calendar.createEventAsync(calendarId, {
    title: event.title,
    startDate: new Date(event.startsAt),
    endDate: new Date(event.endsAt),
    location: event.location,
    timeZone: "UTC",
  });
}
