// The top bar's date marker, its link to Today; the button around it supplies the accessible name.
import { formatDate } from "./dates.ts";

export default function TodayCalendar({ date }: { date: Date }) {
  return <span className="today-tile" aria-hidden="true">
    <b>{formatDate(date, { weekday: "short" })}</b><span>{date.getDate()}</span>
  </span>;
}
